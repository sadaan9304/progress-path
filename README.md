# ⚡ PROGRESS PATH BY SADAAN

> **Futuristic 3D Student Progress Tracking Platform for School and College Students**  
> *Designed for Students, Teachers, Parents, and Administrators with high-impact neon glass aesthetics.*

---

## 🚀 Key Features

- **Multi-Tier Audience**: Built for both **School Students** (Class 1–12) and **College / University Students** (B.Tech, BCA, Semester/Course credits).
- **Four Distinct Roles**:
  - 🎓 **Student**: Add and manage personal marks, track daily attendance, complete study tasks, view weekly schedule, showcase technical skills/projects, and inspect real-time performance analytics.
  - 👨‍🏫 **Teacher**: Switch between assigned students, monitor academic records, record exam marks, log class attendance, and add teacher remarks.
  - 👨‍👩‍👧 **Parent**: Dedicated read-only monitoring terminal to inspect child's attendance rate, exam scores, upcoming task deadlines, and timetable.
  - 🛡️ **Administrator**: Universal management hub to register students/teachers/parents, assign students to teachers, link children to parents, and oversee all system records.
- **Futuristic 3D Neon Glassmorphism**:
  - Obsidian dark void theme (`#030712`) with ambient radial cyan/blue backlights.
  - Glass panels with `backdrop-filter: blur(18px)`, neon borders, and glowing shadows.
  - Interactive 3D card tilt and mouse parallax effects.
  - Chart.js neon performance trajectories & attendance doughnut charts.
- **Full-Stack Security & Persistence**:
  - MongoDB database with Mongoose schemas.
  - Bcrypt-hashed password encryption (12 salt rounds).
  - Secure server-side sessions stored in MongoDB (`connect-mongo`).
  - Role-aware route guards and record authorization middleware.

---

## 📁 Project Architecture & Folder Structure

```
PROGRESS TRACK STUDENT/
├── .env                  # Active environment variables (MongoDB URI, session secret)
├── .env.example          # Environment configuration template
├── .gitignore            # Git exclusion rules (node_modules, .env)
├── package.json          # Node.js project manifest & scripts
├── server.js             # Express application, REST API endpoints & route guards
├── README.md             # Complete step-by-step documentation
├── middleware/
│   └── auth.js           # Session authentication & role check middleware
├── models/
│   ├── User.js           # Student, Teacher, Parent, Admin user schema
│   └── Record.js         # Marks, Attendance, Task, Timetable, Skill schema
├── scripts/
│   ├── create-admin.js   # Script to initialize or reset an Administrator account
│   └── seed-demo.js      # Rich demo seeder across all 4 roles with sample data
└── public/
    ├── index.html        # Futuristic single-page web interface & modals
    ├── style.css         # 3D black & neon blue glassmorphism styles
    └── app.js            # Client-side dynamic app, Chart.js & API integrations
```

---

## 🛠️ Step-by-Step Beginner Setup Guide (VS Code on Windows)

### Step 1: Install Node.js LTS
If you haven't installed Node.js yet:
1. Download the **LTS (Long Term Support)** installer from [nodejs.org](https://nodejs.org).
2. Run the installer and check the box to automatically install necessary tools.
3. Restart VS Code so your terminal recognizes `node` and `npm`.

### Step 2: Set Up MongoDB
Choose either **Local MongoDB** or **Free Cloud MongoDB Atlas**:

- **Option A (Local MongoDB Community Server)**:
  1. Download and install [MongoDB Community Server](https://www.mongodb.com/try/download/community).
  2. The default connection string is already configured in `.env`:
     ```env
     MONGODB_URI=mongodb://127.0.0.1:27017/progress_path
     ```

- **Option B (Free MongoDB Atlas Cloud - No Installation Needed)**:
  1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas).
  2. Create a free M0 cluster and copy your connection string.
  3. In `.env`, paste your Atlas URI:
     ```env
     MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/progress_path?retryWrites=true&w=majority
     ```

### Step 3: Install Dependencies
Open the terminal in VS Code (`Ctrl + ~` or Terminal > New Terminal):
```powershell
npm install
```

### Step 4: Preload Demo Data Across All 4 Roles
Run the built-in seed script to instantly create test accounts with marks, attendance, tasks, and timetable:
```powershell
npm run seed
```

This will populate:
| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@progresstrack.com` | `Password1234!` | Full system management & account creation |
| **Teacher** | `teacher@academy.com` | `Password1234!` | Assigned to students Aarav & Sara |
| **Parent** | `parent@family.com` | `Password1234!` | Linked to school student Aarav (Read-only) |
| **College Student** | `sara@college.com` | `Password1234!` | B.Tech CSE (3rd Year) with marks & skills |
| **School Student** | `aarav@school.com` | `Password1234!` | Class 10th student with quarterly tests |

### Step 5: Start the Application
Run the development server:
```powershell
npm run dev
```
*(Or use `npm start`)*

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 👥 How to Test Each User Role

### 1. Test as Student (`sara@college.com` or `aarav@school.com`)
- Log in with `Password1234!`.
- View personal metrics: Average Marks %, Attendance Rate, Pending Tasks, and Records Count.
- Switch between tabs (**Marks & Exams**, **Attendance Hub**, **Study Tasks**, **Weekly Timetable**, **Skills & Projects**).
- Click **+ Add Entry** or check off completed study tasks in real-time.

### 2. Test as Teacher (`teacher@academy.com`)
- Log in with `Password1234!`.
- Notice the **STUDENT RECORD** dropdown in the top navbar.
- Switch between **Aarav Sharma** and **Sara Khan** to inspect and update their records.
- Add teacher marks and evaluations for assigned students.

### 3. Test as Parent (`parent@family.com`)
- Log in with `Password1234!`.
- The topbar displays **MONITORING CHILD: Aarav Sharma**.
- A glowing `👁️ PARENT READ-ONLY MONITOR` badge appears.
- Parents can review attendance percentage (with safe/warning alerts), exam marks, and timetable without modifying student data.

### 4. Test as Administrator (`admin@progresstrack.com`)
- Log in with `Password1234!`.
- An exclusive **Admin Center** navigation tab unlocks.
- View total system statistics across Students, Teachers, Parents, and Admins.
- Create new accounts, assign students to teachers, link children to parents, or remove obsolete records.

---

## 🔒 Production & Regional Compliance Checklist
Before deploying for real institutional use:
1. Replace `SESSION_SECRET` in `.env` with a 64+ character random string.
2. Set `NODE_ENV=production` so cookies enforce `secure: true` over HTTPS.
3. Configure institutional domain email verification and password reset workflows.
4. Set up role-based audit logging for grade and attendance modifications.
5. Comply with regional student data protection guidelines (e.g. FERPA, GDPR, or applicable regional privacy laws).

