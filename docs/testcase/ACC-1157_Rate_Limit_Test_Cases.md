# รายงานการทดสอบ: Rate Limit — ACC-1157

**Task:** https://app.clickup.com/t/86ex7aucy  
**Story:** ACC-1138  
**Tester:** satoshi tcg  
**วันที่:** รอ update  
**สถานะ:** รอดำเนินการ

---

## ข้อมูลทั่วไป

Rate Limit เป็น feature ที่ implement เพื่อป้องกัน brute force, fraud และ API abuse บน customer routes โดยใช้ MongoDB atomic operation แทน fiber built-in limiter

### ข้อจำกัดที่ต้องตรวจสอบ

- ใช้ MongoDB shared state (ไม่ใช่ in-memory) เพราะ k8s มีหลาย pods
- ACCOUNT/SUPERADMIN roles ต้อง exempt ไม่ถูก limit

### Tiers ที่ต้อง test

| Tier | Endpoint | Limit | Key |
|------|----------|-------|-----|
| strict | POST /v1/auth/customer/sign-in | 5 req/min | IP |
| payment | POST /v1/billing-note/payment/verify | 10 req/min | userID |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID หรือ IP |

### การ response เมื่อถูก block

```
HTTP 429
{
  "success": false,
  "code": 10027,
  "message": "too many requests"
}
```

---

## ข้อกำหนดก่อนการทดสอบ

### ต้องมี

- Customer account อย่างน้อย 1 account (สำหรับ test sign-in)
- Customer accounts อย่างน้อย 2 accounts (สำหรับ test user isolation)
- Valid invoice ID สำหรับ test payment verify
- ACCOUNT หรือ SUPERADMIN account (สำหรับ test exempt)

### ถ้ายังไม่มี

- สร้าง test accounts เอง หรือขอจาก dev team
- ขอ test invoice จาก dev team
- ขอ admin account สำหรับ test exempt

---

## ขั้นตอนการทดสอบ

### TC-01: Sign-in Rate Limit — เกิน 5 ครั้ง

**วัตถุประสงค์:** ตรวจสอบว่า sign-in ถูก limit ที่ 5 req/min ตามที่กำหนด

**ขั้นตอน:**
1. ส่ง POST /v1/auth/customer/sign-in 6 ครั้งภายใน 1 นาที จาก IP เดียวกัน
2. บันทึก HTTP status และ response body ของแต่ละครั้ง

**คำสั่งทดสอบ:**
```bash
for i in {1..6}; do
  curl -X POST https://apixint-sit.askmebill.com/v1/auth/customer/sign-in \
    -H "Content-Type: application/json" \
    -d '{"username":"test_user","password":"Test1234!"}'
  echo "Request #$i"
done
```

**ผลลัพธ์ที่คาดหวัง:**

| Request | HTTP | ผลลัพธ์ |
|---------|------|----------|
| 1 | 200 | สำเร็จ |
| 2 | 200 | สำเร็จ |
| 3 | 200 | สำเร็จ |
| 4 | 200 | สำเร็จ |
| 5 | 200 | สำเร็จ |
| 6 | **429** | ถูก block |

**เกณฑ์การผ่าน:** Request ที่ 6 ได้ HTTP 429 และ code = 10027

**ผลการทดสอบจริง:**

| Request | HTTP | ผลลัพธ์ |
|---------|------|----------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |

**Status:** ⬜ รอทดสอบ

---

### TC-02: Window Reset — หลัง 1 นาทีทำได้ใหม่

**วัตถุประสงค์:** ตรวจสอบว่า window reset ทำงานถูกต้อง

**ขั้นตอน:**
1. รอให้ถูก block จาก TC-01
2. รอ 61 วินาที
3. ส่ง sign-in request อีกครั้ง

**ผลลัพธ์ที่คาดหวัง:** Request หลังรอ 61 วินาที ได้ HTTP 200 (window ใหม่เริ่มนับใหม่)

**ผลการทดสอบจริง:**

| Event | เวลา |
|-------|-------|
| ถูก block (request ที่ 6) | HH:MM:SS |
| รอเวลา | 61 วินาที |
| Request ถัดไป | HH:MM:SS, HTTP ___ |

**Status:** ⬜ รอทดสอบ

---

### TC-03: IP Isolation — IP ต่างกัน count แยกกัน

**วัตถุประสงค์:** ตรวจสอบว่า IP แต่ละตัวมี count แยกกัน

**ขั้นตอน:**
1. ทำให้ IP-A ถูก block (6 ครั้ง)
2. ส่ง request จาก IP-B 5 ครั้ง

**ผลลัพธ์ที่คาดหวัง:**
- IP-A: ถูก block
- IP-B: ทำได้ปกติ 5 ครั้ง

**หมายเหตุ:** ข้ามถ้าไม่มี 2 IP สำหรับทดสอบ

**Status:** ⬜ รอทดสอบ / ⬜ ข้าม

---

### TC-04: Payment Verify Rate Limit — เกิน 10 ครั้ง

**วัตถุประสงค์:** ตรวจสอบว่า payment verify ถูก limit ที่ 10 req/min

**ขั้นตอน:**
1. ส่ง POST /v1/billing-note/payment/verify 11 ครั้งภายใน 1 นาที
2. ใช้ token จาก account เดียวกัน

**คำสั่งทดสอบ:**
```bash
TOKEN="<sign-in token>"
for i in {1..11}; do
  curl -X POST https://apixint-sit.askmebill.com/v1/billing-note/payment/verify \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"invoice_id":"<valid_invoice_id>","amount":100}'
  echo "Request #$i"
done
```

**ผลลัพธ์ที่คาดหวัง:** Request ที่ 11 ได้ HTTP 429

**Status:** ⬜ รอทดสอบ

---

### TC-05: User Isolation — User ต่างกัน count แยกกัน

**วัตถุประสงค์:** ตรวจสอบว่า user แต่ละคนมี count แยกกัน

**ขั้นตอน:**
1. ให้ User-A ส่ง verify 11 ครั้ง → request ที่ 11 ถูก block
2. ให้ User-B ส่ง verify 11 ครั้ง → request ที่ 11 ถูก block
3. ตรวจสอบว่า user ทั้งสอง count แยกกัน

**ผลลัพธ์ที่คาดหวัง:** User-A และ User-B count แยกกัน ไม่กระทบกัน

**Status:** ⬜ รอทดสอบ

---

### TC-06: Standard Route Rate Limit — เกิน 60 ครั้ง

**วัตถุประสงค์:** ตรวจสอบว่า standard customer routes ถูก limit ที่ 60 req/min

**ขั้นตอน:**
1. ระบุ endpoint ที่เป็น standard customer route (เช่น GET /v1/customer/info)
2. ส่ง request 61 ครั้งภายใน 1 นาที

**ผลลัพธ์ที่คาดหวัง:** Request ที่ 61 ได้ HTTP 429

**หมายเหตุ:** ต้องสอบถาม dev ว่า standard routes มี endpoint ใดบ้าง

**Status:** ⬜ รอทดสอบ

---

### TC-07: Response Format — ตรวจสอบ format ของ response

**วัตถุประสงค์:** ตรวจสอบว่า response เมื่อถูก block มี format ถูกต้อง

**ขั้นตอน:**
1. ทำให้ถูก block
2. ตรวจสอบ response headers และ body

**ผลลัพธ์ที่คาดหวัง:**

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "success": false,
  "code": 10027,
  "message": "too many requests"
}
```

**เกณฑ์การผ่าน:**
- HTTP Status = 429
- `success` = false
- `code` = 10027 (ตัวเลข)
- `message` = "too many requests"

**Status:** ⬜ รอทดสอบ

---

### TC-08: ⚠️ ADMIN Exempt — สำคัญมาก

**วัตถุประสงค์:** ตรวจสอบว่า ACCOUNT/SUPERADMIN roles ไม่ถูก rate limit

**ขั้นตอน:**
1. ขอ ACCOUNT หรือ SUPERADMIN account จาก dev team
2. ส่ง sign-in 10 ครั้งด้วย account นั้น

**ผลลัพธ์ที่คาดหวัง:** ทั้ง 10 ครั้งได้ HTTP 200 ไม่มี 429

**ความสำคัญ:** ถ้า ADMIN ถูก block ด้วย = **bug ร้ายแรง** เพราะ constraint กำหนดชัดว่าต้อง exempt

**Status:** ⬜ รอทดสอบ

---

### TC-09: Multi-Pod State — ตรวจสอบว่าใช้ MongoDB shared state

**วัตถุประสงค์:** ตรวจสอบว่า rate limit ใช้ MongoDB shared state ไม่ใช่ in-memory

**ขั้นตอน:**
1. ส่ง sign-in 6 ครั้งเร็วๆ (1-2 วินาที)
2. สังเกตว่าครั้งที่ 6 ถูก block ไหม

**ผลลัพธ์ที่คาดหวัง:** Request ที่ 6 ได้ HTTP 429 (พิสูจน์ว่าใช้ MongoDB)

**ถ้า fail:** ทั้ง 6 ครั้งได้ 200 → แปลว่าใช้ in-memory → **bug**

**Status:** ⬜ รอทดสอบ

---

## สรุปผลการทดสอบ

| TC | รายการ | ผล | หมายเหตุ |
|----|--------|------|-------------|
| TC-01 | Sign-in เกิน 5 ครั้ง | ⬜ | |
| TC-02 | Window reset | ⬜ | |
| TC-03 | IP isolation | ⬜ | หรือข้าม |
| TC-04 | Verify เกิน 10 ครั้ง | ⬜ | |
| TC-05 | User isolation | ⬜ | |
| TC-06 | Standard เกิน 60 ครั้ง | ⬜ | ต้องถาม dev หา endpoint |
| TC-07 | Response format | ⬜ | |
| TC-08 | **ADMIN exempt** | ⬜ | ⚠️ สำคัญ |
| TC-09 | Multi-pod state | ⬜ | |

**สรุป:** ผ่าน ___/9 | ไม่ผ่าน ___/9 | ข้าม ___/9

---

## ปัญหาและอุปสรรค

| ปัญหา | วิธีแก้ |
|--------|----------|
| ไม่มี test accounts | สร้างหรือขอจาก dev |
| ไม่มี valid invoice | ขอ test invoice จาก dev |
| ไม่มี admin account | ขอจาก dev team |
| ไม่รู้ standard routes | สอบถาม dev |

---

## Bug Report

ถ้าพบ defect:

```
Title: [TC-XX] - สิ่งที่ผิดพลาด
Severity: P0 / P1 / P2
Environment: SIT

Steps to Reproduce:
1. ...
2. ...

Expected Result:
...

Actual Result:
...

Evidence:
[screenshot / curl output]

Impact:
[ผลกระทบต่อระบบ]
```

---

## หมายเหตุ

- **TC-08 ADMIN Exempt** ต้อง test ก่อน deploy เพราะถ้า fail = ไม่สามารถ deploy ได้
- **TC-09 Multi-Pod** ต้องตรวจสอบว่าใช้ MongoDB shared state จริง ไม่ใช่ in-memory
- ถ้า k8s มีแค่ 1 pod อาจไม่สามารถ test TC-09 ได้ → ข้ามได้
