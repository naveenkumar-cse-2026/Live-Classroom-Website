# Live AI Classroom PRO

Zero-dependency real-time academic platform (Student Portal + Secured Admin Operations Console + Persistent Local Backend).

## Architecture & Exportable Project Structure
```text
e:\AI app\
├── Start-LiveClassroom.bat   # One-click Windows launcher (starts server on port 8080 & opens browser)
├── server.ps1                # PowerShell/.NET HTTP server + PBKDF2-SHA256 Auth + JSON persistence
├── README.md                 # Run & export instructions
├── data\
│   ├── db.json               # Application database (students, teachers, timetable, materials, notices, settings)
│   ├── auth.json             # Backend-only PBKDF2-SHA256 password hashes (NEVER exposed via API or static routes)
│   └── sessions.json         # Active bearer session tokens
└── public\
    ├── index.html            # Application shell & Tailwind configuration
    ├── css\app.css           # Obsidian glassmorphic styling & animations
    └── js\
        ├── app.js            # SPA router & Admin route guard
        ├── store.js          # Real-time sync store & authenticated API client
        ├── ai-engine.js      # Gemini 2.5 API + local academic AI & math solver
        ├── ui.js             # Shared UI components, confirmation modals, responsive sidebar
        ├── views-auth.js     # Student Login/Registration (#auth) & separate Admin Login (#admin/login)
        ├── views-student.js  # Student Home, AI Tutor, Scan & Solve, Study Vault, Assignments/Notices, Profile
        └── views-admin.js    # Admin Dashboard, Students, Teachers, Resources, Timetable & Events, College Settings
```

## Security & Authentication
- **Separate Roles & Routes**:
  - Student Portal Login: `http://localhost:8080/#auth`
  - Administrator Login: `http://localhost:8080/#admin/login`
  - Students have no direct access to `#admin/*` routes (blocked by both the frontend router and backend `403 Forbidden` enforcement on `PUT /api/state`).
- **Password Storage**: All administrator and student passwords are hashed on the backend using **PBKDF2-HMAC-SHA256** (100,000 iterations + 16-byte random salt) inside `data/auth.json`. Plaintext passwords are never stored in `data/db.json` or sent to the browser.
- **Initial Admin Credentials**:
  - **Admin Name**: `Naveen Kumar`
  - **Initial Password**: `Naveen@2008`
  - After first login, use the security banner or **College Settings → Change Admin Password** to set a permanent password.

## How to Run Locally
1. Double-click **`Start-LiveClassroom.bat`** (or run `powershell -NoProfile -ExecutionPolicy Bypass -File ".\server.ps1" -Port 8080`).
2. Open `http://localhost:8080/#auth` for Student Login or `http://localhost:8080/#admin/login` for Administrator Login.

## How to Package & Export the Project
Because this project uses native Windows PowerShell/.NET + zero-build ES modules (`public/`), no `npm install` or bundler build step is required:
1. Stop any running `Start-LiveClassroom.bat` server window.
2. Copy or ZIP the entire `e:\AI app\` folder (include `Start-LiveClassroom.bat`, `server.ps1`, `README.md`, `public\`, and `data\db.json` + `data\auth.json` if you want to carry over existing accounts/timetable; exclude `data\sessions.json` so exported copies start with fresh sessions).
3. On any Windows PC, extract the folder and double-click `Start-LiveClassroom.bat`.
4. **Gemini API Key**: Configure or re-enter your Gemini API key in **Student Profile → Live Gemini AI Connector** on any new browser/device (stored locally in that browser's `localStorage`).
