# Redis Capacity Report — Rate Limit Store (ACC-1427)

**Date:** 2026-06-11
**Target:** dev Redis (host redacted — `redis-accounting-dev`), measured live, read+write+cleanup
**Goal:** ตอบว่า "Redis RAM 2MB พอไหม" สำหรับ rate-limit store ที่ migrate จาก MongoDB → Redis

---

## TL;DR

- **"2MB" คือความเข้าใจผิด** — `maxmemory` จริงของ instance = **429,496,729 B ≈ 409.6 MiB (0.4 GiB)** ส่วน "2MB" คือ `used_memory` ของ Redis เปล่าๆ (baseline overhead) ไม่ใช่เพดาน
- วัด per-key จริง (Redis 8.2.1) = **~125–150 bytes/key** (รวม overhead dict + expire + allocator)
- **2MB ในฐานะ `maxmemory` cap = เป็นไปไม่ได้** — baseline ของ Redis เปล่า (2.29 MB) เกิน 2 MB cap อยู่แล้ว (−196 KB)
- ที่ 410 MiB instance นี้จุ **~2.8–3.4 ล้าน key** → รองรับ **~1 ล้าน distinct subject/นาที** → **memory ไม่ใช่คอขวด**

---

## Method

- เลียนแบบ algorithm `Allow()` ของ ACC-1429: key `rl:loadtest:user:{24-hex}:{bucket}`, `SET ... EX 120` (TTL = window×2)
- namespace `rl:loadtest:*` แยกชัด ไม่ชนกับ `rl:{dev,sit,uat,prod}:*` ของจริง
- วัด `used_memory` (`INFO memory`) เทียบ baseline ที่ 1k / 5k / 10k keys
- **cleanup:** `UNLINK` ทุก key แล้ว verify `DBSIZE` กลับเป็นค่าเดิม (0)
- creds ส่งผ่าน env ไม่เขียนลงไฟล์ใดๆ

## Raw measurements

| keys | used_memory (B) | Δ vs baseline (B) | per-key avg (B) |
|-----:|----------------:|------------------:|----------------:|
| 0 (baseline) | 2,293,160 | — | — |
| 1,000 | 2,441,496 | 148,336 | 148.3 |
| 5,000 | 3,048,328 | 755,168 | 151.0 |
| 10,000 | 3,534,264 | 1,241,104 | 124.1 |

- `MEMORY USAGE` ของ key เดี่ยว = 16 B (ต่ำผิดปกติ — ไม่รวม overhead dict/expire จึงไม่ใช้ตัวเลขนี้; ใช้ used_memory-delta แทน)
- `maxmemory` = 429,496,729 B · policy = `volatile-lru` · Redis 8.2.1 standalone master

## Capacity (ใช้ 150 B/key แบบ conservative)

```
usable = maxmemory − baseline = 429,496,729 − 2,293,160 = 427,203,569 B
capacity ≈ 427,203,569 / 150 ≈ 2.85 ล้าน key   (ที่ 124 B/key = 3.44 ล้าน)
```

แปลงเป็น traffic (key มีอายุ 120s → ทุกเวลามี ~2.5 bucket มีชีวิต):

| distinct subject/นาที | live keys (×2.5) | memory ที่ใช้ | สถานะที่ 410 MiB |
|----------------------:|-----------------:|--------------:|:----------------:|
| 1,000 | 2,500 | ~0.4 MB | สบาย |
| 10,000 | 25,000 | ~3.8 MB | สบาย |
| 100,000 | 250,000 | ~38 MB | สบาย |
| 1,000,000 | 2,500,000 | ~375 MB | เริ่มเต็ม |

→ ต้องมี **~1 ล้าน distinct user+IP ต่อนาที** ถึงจะเริ่มชน 410 MiB

## ตอบ "2MB พอไหม"

| ความหมายของ "2MB" | คำตอบ |
|-------------------|-------|
| `maxmemory` cap = 2MB | ❌ **เป็นไปไม่ได้** — Redis เปล่า baseline 2.29MB เกิน cap แล้ว |
| ปริมาณ rate-limit data = 2MB | ✅ จุได้ ~14,000 key ≈ 5,600 subject/นาที — เล็กจิ๋วใน 410 MiB |
| instance จริง (410 MiB) | ✅ **เหลือเฟือ** memory ไม่ใช่ปัญหา |

## ความเสี่ยงจริง (ไม่ใช่ memory)

1. **`maxmemory-policy: volatile-lru`** — rate-limit key มี TTL ทั้งหมด → ถ้า instance นี้ถูกใช้เก็บอย่างอื่นจนเต็ม จะ evict counter ทิ้ง → **user ยิงเกิน limit ได้เงียบๆ** (rate-limit bypass) อันตรายกว่า OOM
2. **fail-open / Mongo fallback** — comment ACC-1431 ระบุ "มี fallback กลับไป mongodb" ขัดกับ ACC-1427 ("Redis only") → พฤติกรรมตอน Redis ล่มยังต้องยืนยัน
3. **DBSIZE = 0** — ตอนตรวจ Redis ว่างสนิททุก DB ทั้งที่มี 6 client → rate-limiter ยังไม่เขียนลง Redis ตัวนี้ (migration ยังไม่ deploy dev / หรือใช้ Mongo fallback อยู่)
4. **Security** — ต่อติด **plaintext port 6379 ผ่าน host internet-facing** → creds/data ไม่เข้ารหัส

## Recommendations

- **ไม่ต้อง load test RAM** — overkill; 410 MiB over-provisioned สำหรับ dataset ที่ key อายุ 2 นาที
- อย่าตั้ง `maxmemory` ต่ำกว่า ~10–20 MiB (ต่ำกว่านั้นชน baseline)
- พิจารณา **dedicate instance นี้ให้ rate-limit อย่างเดียว** หรือเปลี่ยน policy — กัน volatile-lru evict counter
- Monitor `used_memory`, `evicted_keys`, latency แทนการ test RAM
- ลงแรง test ที่ **behavior**: fail-open/fallback, latency ต่อ request, eviction correctness
- ปิด public/plaintext access → บังคับ TLS หรือใช้ internal host เท่านั้น

---

## Latency & Throughput (load-tested 2026-06-11)

**Method:** ยิง PING / INCR / INCR+EXPIRE แบบ serial (วัด round-trip ทีละ op, 200/200/100 ครั้ง) + pipelined throughput 20k INCR · namespace `rl:loadtest:*` · cleanup ครบ (ลบ 20,300 key → `DBSIZE 0`) · creds ผ่าน env

**หมายเหตุ network:** path จาก test host → Redis วัดได้ **~0.27ms RTT** (เร็วผิดคาด — น่าจะ AWS region เดียวกัน) → ตัวเลขนี้ **ใกล้เคียงของจริงใน-cluster** ไม่ได้ inflated

| operation | p50 | p95 | p99 | max |
|-----------|----:|----:|----:|----:|
| PING (network RTT baseline) | 0.272 | 0.610 | 1.182 | 1.226 |
| INCR (per-request ปกติ) | 0.303 | 0.727 | 1.117 | 1.137 |
| INCR+EXPIRE (first-hit, 2 round-trips) | 0.541 | 1.479 | 2.157 | 2.157 |

*(หน่วย ms)*

- **Server processing ฝั่ง Redis ≈ 0.031 ms (31 µs)** = INCR p50 − PING p50 → แทบเป็นศูนย์ (INCR เป็น O(1))
- **Throughput (pipelined): ~214,000 INCR/sec**

**สรุป latency:**
- middleware เพิ่ม **~0.3 ms/request** (steady-state) หรือ **~0.54 ms** ตอน first-hit (INCR+EXPIRE = 2 round-trips)
- Redis รับ **~200k+ ops/sec** → ไม่ใช่คอขวดแม้ prod request rate สูง
- **Optimization (optional):** first-hit ทำ 2 round-trips เพราะ ACC-1429 แยก `INCR` กับ `EXPIRE` → รวมเป็น Lua script/pipeline จะเหลือ 1 RT (~0.3ms) ลด tail latency (ACC-1429 Notes ระบุ Lua เป็น option ไว้แล้ว)

**สรุปรวมทั้งรายงาน:** memory ไม่ใช่ปัญหา + latency/throughput ก็ไม่ใช่ปัญหา → Redis เหมาะกับ rate limit นี้สบาย ความเสี่ยงจริงอยู่ที่ **eviction policy (`volatile-lru`), fail-open/fallback behavior, security (plaintext)** — ไม่ใช่ performance
