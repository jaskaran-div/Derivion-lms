# 🎓 Derivion LMS — Setup Guide

A complete Learning Management System with Admin & Student portals, Razorpay payments, AWS S3/CloudFront video hosting, and PostgreSQL database.

---

## 📋 Prerequisites

Install these before running the project:

1. **Node.js** v18+ → [nodejs.org](https://nodejs.org)
2. **PostgreSQL** v14+ → [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
3. **AWS Account** (for S3 + CloudFront video storage)
4. **Razorpay Account** (for payment gateway) → [razorpay.com](https://razorpay.com)

---

## 🗄️ Step 1: Install & Start PostgreSQL

1. Download and install PostgreSQL from the link above
2. During install, set a password for the `postgres` user (remember it!)
3. Open **pgAdmin** or run in terminal:
   ```powershell
   psql -U postgres
   ```
4. Create the database:
   ```sql
   CREATE DATABASE derivion_lms;
   \q
   ```

---

## ⚙️ Step 2: Configure Backend Environment

Edit `backend/.env` with your real values:

```env
# Database (update USER and PASSWORD)
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/derivion_lms"

# JWT (keep as-is or change for production)
JWT_SECRET="derivion-lms-super-secret-jwt-key-2024"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_SECRET="derivion-lms-refresh-secret-2024"
JWT_REFRESH_EXPIRES_IN="30d"

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# AWS S3 (get from AWS Console → IAM → Access Keys)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-bucket-name
CLOUDFRONT_DOMAIN=your-id.cloudfront.net

# Razorpay (get from Razorpay Dashboard → Settings → API Keys)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Email (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
FROM_EMAIL=noreply@derivion.com
FROM_NAME=Derivion LMS
```

The local environment file must stay untracked. Use `backend/.env.example` as
the variable-name reference, and store real credentials only in your local
`.env` file or the hosting provider's environment settings.

---

## 🚀 Step 3: Run Database Migration & Seed

```powershell
# Navigate to backend folder
cd backend

# Push schema to database
npx prisma db push

# Seed with initial data (admin + sample courses)
node prisma/seed.js
```

**Default accounts created by seed:**
| Role | Email | Password |
|------|-------|---------|
| Admin | admin@derivion.com | Admin@123 |
| Student | student@derivion.com | Student@123 |

---

## 🏃 Step 4: Start Both Servers

**Terminal 1 — Backend API:**
```powershell
cd backend
npm run dev
# Runs at: http://localhost:5000
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
# Runs at: http://localhost:3000
```

---

## 🌐 Accessing the App

Open **http://localhost:3000** in your browser.

- Login as **Admin** → redirected to `/admin/dashboard`
- Login as **Student** → redirected to `/dashboard`

---

## 📁 Project Structure

```
derivion-lms/
├── backend/                    # Node.js + Express API
│   ├── prisma/
│   │   ├── schema.prisma       # Full database schema
│   │   └── seed.js             # Demo data seeder
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js     # Prisma client
│   │   │   └── aws.js          # S3 + CloudFront config
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── courseController.js
│   │   │   ├── contentController.js
│   │   │   ├── paymentController.js
│   │   │   ├── userController.js
│   │   │   └── assessmentController.js
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT + Role auth
│   │   │   ├── errorHandler.js
│   │   │   └── upload.js       # Multer file uploads
│   │   └── routes/
│   │       ├── auth.js         # Auth endpoints
│   │       ├── courses.js      # Course CRUD + content
│   │       └── index.js        # All other routes
│   ├── server.js               # Express app entry
│   └── .env                    # Environment config
│
└── frontend/                   # Next.js 14 App Router
    └── src/
        ├── app/
        │   ├── login/          # Login page
        │   ├── register/       # Registration page
        │   ├── forgot-password/
        │   ├── dashboard/      # Student dashboard
        │   ├── courses/        # Browse + Course detail
        │   ├── my-courses/     # Enrolled courses
        │   ├── certificates/   # Earned certificates
        │   ├── forum/          # Discussion forum
        │   ├── assessments/    # Quiz/assessment page
        │   ├── settings/       # User settings
        │   ├── payment/        # Payment callback
        │   └── admin/
        │       ├── dashboard/  # Admin overview
        │       ├── courses/    # Course management
        │       ├── users/      # User management
        │       ├── payments/   # Transaction history
        │       ├── analytics/  # Platform analytics
        │       ├── categories/ # Course categories
        │       ├── notifications/ # Broadcast messages
        │       └── settings/   # System settings
        ├── components/
        │   └── layout/
        │       ├── Sidebar.tsx  # Role-aware sidebar
        │       ├── Header.tsx   # App header
        │       └── AppLayout.tsx # Auth-protected wrapper
        ├── lib/
        │   └── api.ts          # Axios API client
        └── store/
            └── authStore.ts    # Zustand auth state
```

---

## ☁️ Deploy both apps to Render

The repository-root `render.yaml` defines separate Render web services for the
API (`backend/`) and Next.js app (`frontend/`). Connect this repository to
Render as a Blueprint to deploy both services from the same GitHub repository.

Before deploying:

1. Create a PostgreSQL database on Render (or use another PostgreSQL database)
   and set the API service's `DATABASE_URL` to its internal connection string.
   The Blueprint intentionally does not provision a database.
2. The Blueprint generates `JWT_SECRET` and `JWT_REFRESH_SECRET`. Keep all
   credentials and other secrets in Render's environment settings.
3. For persistent course uploads, configure `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_S3_BUCKET` on the API
   service. Render's local filesystem is not persistent across deploys.
4. Run `npm run db:push` from the API service's Shell once the database is
   configured to create the Prisma schema.
5. Add integrations such as Razorpay and SMTP as API service environment
   variables when needed.

The API's `CLIENT_URL` and the frontend's `NEXT_PUBLIC_API_URL` use the
Blueprint's Render service URLs. If you use custom domains, update both values.

## 🎯 Features Summary

### Admin Portal
- 📊 Dashboard with KPI stats, enrollments, revenue
- 📚 Course management: create, edit, publish/unpublish
- 📁 Curriculum builder: sections + content (video/PDF/quiz)
- 🎬 Direct video upload to AWS S3 with progress bar
- 👥 User management: create, activate/deactivate, enroll
- 💳 Payment transaction history
- 📈 Analytics with enrollment/revenue charts
- 🏷️ Category management with emoji icons
- 🔔 Broadcast notifications to all students
- ⚙️ System settings panel

### Student Portal
- 🏠 Personalized dashboard with progress overview
- 🔍 Course browsing with search + filters
- 🛒 Course purchase via Razorpay payment gateway
- 📹 Video playback from CloudFront CDN
- 📊 Lesson-by-lesson progress tracking
- 🎯 Quiz/Assessment with timer, auto-submit
- 🏆 Certificate display and download
- 💬 Course discussion forum
- 🔔 In-app notification center
- ⚙️ Profile + password settings

---

## 🔒 Security Features

- **JWT** access + refresh token rotation
- **Bcrypt** password hashing
- **Helmet.js** security headers
- **Rate limiting** on auth endpoints
- **Role-based access control** (ADMIN / STUDENT)
- **Input validation** on all endpoints
- **Signed CloudFront URLs** for video content

---

## ☁️ AWS S3 Setup (For Video Uploads)

1. Go to AWS Console → S3 → Create Bucket
2. Name: `derivion-lms-content` (or your choice)
3. Region: `ap-south-1` (Mumbai)
4. **Uncheck** "Block all public access"
5. Create CloudFront distribution pointing to S3
6. Copy CloudFront domain to `CLOUDFRONT_DOMAIN` in `.env`
7. Create IAM user with S3 full access → copy keys to `.env`

---

## 💳 Razorpay Setup
 
1. Sign up / Log in at [razorpay.com](https://razorpay.com)
2. Switch to Test Mode (or Live Mode when ready)
3. Go to Dashboard → Settings → API Keys → Generate Key
4. Copy **Key ID** to `RAZORPAY_KEY_ID` (in `backend/.env` and `frontend/.env.local`)
5. Copy **Key Secret** to `RAZORPAY_KEY_SECRET` in `backend/.env`
6. (Optional) Set up Webhooks in Razorpay Dashboard pointing to `http://<your-domain>/api/payments/webhook` and copy secret to `RAZORPAY_WEBHOOK_SECRET`

---

## 🛠️ Useful Commands

```powershell
# Backend
npm run dev          # Start backend with nodemon
npx prisma studio    # Visual database browser
npx prisma db push   # Sync schema changes
node prisma/seed.js  # Re-seed demo data

# Frontend
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint check
```
