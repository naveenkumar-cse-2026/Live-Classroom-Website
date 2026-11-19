# Live AI Classroom PRO

Zero-dependency real-time academic platform (Student Portal + Secured Admin Operations Console + Dual Local & Netlify Cloud Backend).

## Architecture & Project Structure
```text
e:\AI app\
├── Start-LiveClassroom.bat   # One-click Windows launcher (starts server on port 8080 & opens browser)
├── server.ps1                # Local Windows PowerShell/.NET HTTP server + PBKDF2-SHA256 Auth
├── netlify.toml              # Netlify cloud build & serverless function routing configuration
├── netlify\
│   └── functions\
│       └── api.js            # Netlify Serverless Backend API (Node.js runtime, PBKDF2-SHA256, sessions)
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
        ├── store.js          # Real-time sync store & authenticated API client (Local + Netlify ready)
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
  - Students have no direct access to `#admin/*` routes (enforced by the frontend router, local `server.ps1`, and cloud `netlify/functions/api.js`).
- **Cryptographic Password Hashing**:
  - All administrator and student passwords are protected using **PBKDF2-HMAC-SHA256** (100,000 iterations + 16-byte random salt).
  - Both `server.ps1` (local) and `netlify/functions/api.js` (cloud) use identical cryptographic algorithms and salt formats.
  - Plaintext passwords are never stored in `db.json` or transmitted in `GET /api/state`.
- **Initial Admin Credentials**:
  - **Admin Name**: `Naveen Kumar`
  - **Initial Password**: `Naveen@2008`
  - On first sign-in, use the security banner or **College Settings → Change Admin Password** to set a permanent password.

## How to Run Locally (Windows)
1. Double-click **`Start-LiveClassroom.bat`**.
2. It automatically stops any stale process on port 8080, boots `server.ps1`, and launches `http://localhost:8080/`.

## How to Deploy to Netlify
1. Connect your GitHub repository (`naveenkumar-cse-2026/Live-Classroom-Website`) to Netlify.
2. Netlify reads `netlify.toml` automatically:
   - **Publish directory**: `public`
   - **Build command**: *(none needed / empty)*
   - **Functions directory**: `netlify/functions`
   - **API routing**: `/api/*` redirects to `/.netlify/functions/api/:splat`
3. Netlify automatically deploys both the frontend and the serverless backend function `api.js`.
4. Authentication, student registration, student login, admin login, timetable editing, and state synchronization work directly online without requiring your laptop to be on.
