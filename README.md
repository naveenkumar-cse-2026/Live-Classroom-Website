# Live AI Classroom PRO

Zero-dependency real-time academic platform (Student Portal + Secured Admin Operations Console + Dual Local & Vercel Serverless Cloud Backend).

## Architecture & Project Structure
```text
e:\AI app\
├── Start-LiveClassroom.bat   # One-click Windows launcher (starts server on port 8080 & opens browser)
├── server.ps1                # Local Windows PowerShell/.NET HTTP server + PBKDF2-SHA256 Auth
├── vercel.json               # Vercel cloud serverless routing & header configuration
├── api\
│   ├── index.js              # Vercel Serverless Backend API (Node.js runtime, PBKDF2-SHA256, multi-tier persistence)
│   └── [...path].js          # Vercel catch-all route forwarder
├── package.json              # Project metadata & Node engine configuration
├── .env.example              # Template for optional free cloud database (Upstash Redis / Vercel KV / Supabase)
├── README.md                 # Run, deploy & export instructions
├── data\
│   ├── db.json               # Application database (students, teachers, timetable, materials, notices, settings)
│   ├── auth.json             # Backend-only PBKDF2-SHA256 password hashes (NEVER exposed via API or static routes)
│   └── sessions.json         # Active runtime bearer session tokens
└── public\
    ├── index.html            # Application shell & Tailwind configuration
    ├── css\app.css           # Obsidian glassmorphic styling & animations
    └── js\
        ├── app.js            # SPA router & Admin route guard
        ├── store.js          # Real-time sync store & authenticated API client (Local + Vercel ready)
        ├── ai-engine.js      # Gemini 2.5 API + local academic AI & math solver
        ├── ui.js             # Shared UI components, confirmation modals, responsive sidebar
        ├── views-auth.js     # Student Login/Registration (#auth) & separate Admin Login (#admin/login)
        ├── views-student.js  # Student Home, AI Tutor, Scan & Solve, Study Vault, Assignments/Notices, Profile
        └── views-admin.js    # Admin Dashboard, Students, Teachers, Resources, Timetable & Events, College Settings
```

## Security & Authentication
- **Separate Roles & Routes**:
  - Student Portal Login: `/#auth`
  - Administrator Login: `/#admin/login`
  - Students have no direct access to `#admin/*` routes (enforced by the frontend router, local `server.ps1`, and cloud `api/index.js`).
- **Cryptographic Password Hashing**:
  - All administrator and student passwords are protected using **PBKDF2-HMAC-SHA256** (100,000 iterations + 16-byte random salt).
  - Both `server.ps1` (local) and `api/index.js` (cloud) use identical cryptographic algorithms and salt formats.
  - Plaintext passwords are never stored in `db.json` or transmitted in `GET /api/state`.
- **Initial Admin Credentials**:
  - **Admin Name**: `Naveen Kumar`
  - **Initial Password**: `Naveen@2008`
  - On first sign-in, use the security banner or **College Settings → Change Admin Password** to set a permanent password.

## How to Run Locally (Windows)
1. Double-click **`Start-LiveClassroom.bat`**.
2. It automatically stops any stale process on port 8080, boots `server.ps1`, and launches `http://localhost:8080/`.

## How to Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"** -> **"Import Git Repository"**.
2. Select your repository: **`naveenkumar-cse-2026/Live-Classroom-Website`**.
3. Configure Project Settings:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Build Command**: *(leave empty)*
   - **Output Directory**: `public`
4. Click **"Deploy"**.
5. Vercel automatically deploys both the frontend and the serverless backend functions in `api/`.
6. Authentication, student registration, student login, admin login, timetable editing, and state synchronization work directly online without requiring your laptop to be on.
