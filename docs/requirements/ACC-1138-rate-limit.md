# ClickUp Task: ACC-1138 — [Story] Rate Limit

## Task Summary

| Field | Value |
|-------|-------|
| **Task ID** | 86ex6dn3a |
| **Custom ID** | ACC-1138 |
| **Name** | [Story] Rate Limit |
| **Status** | merge request (🟦) |
| **List** | Sprint 10 (3/30 - 4/12) |
| **Project** | Delivery-ACC-Sprint |
| **Space** | Askmebill |
| **Assignee** | mustafaibrahim isb |
| **Creator** | mustafaibrahim isb |
| **Tags** | acc-1138 |

## Description

Public routes ของ CUSTOMER role ยังไม่มี Rate Limiting — เสี่ยงต่อ brute force (sign-in), fraud (payment), และ API abuse

### Constraints
- Kubernetes หลาย pod → ต้องใช้ distributed storage (ห้ามใช้ in-memory)
- ใช้ MongoDB findOneAndUpdate
- ต้องไม่กระทบ ACCOUNT / SUPERADMIN roles

### Approach
ใช้ Custom MongoDB Atomic Middleware (ไม่ใช้ Fiber built-in limiter)
- fiber.Storage ใช้ Get → Set แบบ non-atomic → race condition ระหว่าง pod
- แทนด้วย MongoDB findOneAndUpdate ซึ่ง atomic ที่ document level → ปลอดภัยสำหรับ multi-pod

### แนวคิด Window-based Rate Limiting
ระบบแบ่งเวลาเป็น "window" ขนาด 1 นาที แต่ละ window นับ request แยกกัน พอขึ้นนาทีใหม่ก็นับใหม่จาก 0 อัตโนมัติ

### MongoDB document design (collection: rate_limits)
| field | ความหมาย | ตัวอย่าง |
|-------|---------|---------|
| _id | key + รอบนาที (unique ต่อ window) | rl:signin:1.2.3.4:1704067260 |
| count | จำนวน request ในนาทีนั้น | 3 |
| expire_at | หมดอายุหลัง 2 นาที (buffer สำหรับ MongoDB TTL job) | 00:03:00 |

### Rate Limit Tiers
| Tier | Endpoint | Limit | Key |
|------|----------|-------|-----|
| strict | POST /v1/auth/customer/sign-in | 5 req/min | IP |
| payment | POST /v1/billing-note/payment/verify | 10 req/min | userID |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID (fallback IP) |

### Implementation Steps

**Step 0** — response/response_status.go
เพิ่ม `TooManyRequests = ErrorCode{StatusCode: 10027, Message: "too many requests"}`

**Step 1** — core/entities/rate_limit.go (NEW)

**Step 2** — core/ports/rate_limit.go (NEW)

**Step 3** — infrastructure/mongo/rate_limit_repository.go (NEW)

**Step 4** — core/services — ไม่มี (repository เพียงพอ)

**Step 5** — app/api/middlewares/rate_limit.go (NEW)

**Step 6** — app/api/api.go

### Critical Reference Files
| ไฟล์ | วัตถุประสงค์ |
|------|-------------|
| app/api/middlewares/permission.go | อ้างอิง RolePermissions + pathMatch() |
| infrastructure/mongo/token_repository.go | pattern สำหรับ rate_limit_repository |
| core/ports/token.go | pattern สำหรับ rate_limit port |
| app/api/api.go lines 35-39, 391-412 | แก้ struct + middleware registration |
| response/response_status.go | เพิ่ม TooManyRequests |
