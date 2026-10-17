require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const Record = require("./models/Record");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
  console.error("CRITICAL: Missing MONGODB_URI or SESSION_SECRET in .env file.");
  process.exit(1);
}

// Security & Parsing middleware
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));

// Session configuration with MongoDB store
app.use(
  session({
    name: "progresspath.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24 // 1 day
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  })
);

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "public")));

const allowedTypes = ["mark", "attendance", "task", "timetable", "skill"];

// Helper to format clean user profile data for frontend
function cleanUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    educationLevel: user.educationLevel || "school",
    schoolOrCollege: user.schoolOrCollege || "",
    classOrCourse: user.classOrCourse || "",
    assignedStudents: user.assignedStudents || [],
    linkedStudents: user.linkedStudents || []
  };
}

// Helper to verify if an authenticated user can access (read/write) a student's data
function canAccessStudent(user, studentId, write = false) {
  if (!user || !studentId) return false;
  const sId = String(studentId);

  // Admins have universal read and write access
  if (user.role === "admin") return true;

  // Students can only access their own records
  if (user.role === "student") {
    return String(user._id) === sId;
  }

  // Teachers can read and write records for their assigned students
  if (user.role === "teacher") {
    return (user.assignedStudents || []).some((id) => String(id) === sId);
  }

  // Parents can ONLY read records for their linked children (no write permissions)
  if (user.role === "parent") {
    return !write && (user.linkedStudents || []).some((id) => String(id) === sId);
  }

  return false;
}

/* ==========================================================================
   AUTHENTICATION ROUTES
   ========================================================================== */

// Student Registration (Public sign-up is strictly for student accounts)
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password, schoolOrCollege, classOrCourse, educationLevel } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: "student",
      educationLevel: ["school", "college"].includes(educationLevel) ? educationLevel : "school",
      schoolOrCollege: String(schoolOrCollege || "").trim(),
      classOrCourse: String(classOrCourse || "").trim()
    });

    req.session.userId = String(user._id);
    res.status(201).json({ user: cleanUser(user) });
  } catch (err) {
    next(err);
  }
});

// Login for all roles (student, teacher, parent, admin)
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    req.session.userId = String(user._id);
    res.json({ user: cleanUser(user) });
  } catch (err) {
    next(err);
  }
});

// Logout
app.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("progresspath.sid");
    res.json({ message: "Logged out successfully." });
  });
});

// Current User Profile
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: cleanUser(req.user) });
});

/* ==========================================================================
   STUDENTS LIST ROUTE (Role-aware)
   ========================================================================== */

app.get("/api/students", requireAuth, async (req, res, next) => {
  try {
    let students = [];

    if (req.user.role === "admin") {
      students = await User.find({ role: "student" }).select("name email schoolOrCollege classOrCourse educationLevel");
    } else if (req.user.role === "teacher") {
      students = await User.find({
        _id: { $in: req.user.assignedStudents || [] },
        role: "student"
      }).select("name email schoolOrCollege classOrCourse educationLevel");
    } else if (req.user.role === "parent") {
      students = await User.find({
        _id: { $in: req.user.linkedStudents || [] },
        role: "student"
      }).select("name email schoolOrCollege classOrCourse educationLevel");
    } else {
      // Student only sees themselves
      students = [req.user];
    }

    res.json({
      students: students.map((s) => ({
        id: s._id,
        name: s.name,
        email: s.email,
        schoolOrCollege: s.schoolOrCollege,
        classOrCourse: s.classOrCourse,
        educationLevel: s.educationLevel
      }))
    });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================================
   RECORDS CRUD ROUTES (Marks, Attendance, Tasks, Timetable, Skills)
   ========================================================================== */

// Get records (with optional type and studentId filter)
app.get("/api/records", requireAuth, async (req, res, next) => {
  try {
    const { type, studentId } = req.query;

    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid record type filter." });
    }

    let query = {};
    if (type) query.type = type;

    if (studentId) {
      if (!canAccessStudent(req.user, studentId, false)) {
        return res.status(403).json({ error: "Unauthorized access to this student's records." });
      }
      query.studentId = studentId;
    } else {
      // Default scope based on role
      if (req.user.role === "student") {
        query.studentId = req.user._id;
      } else if (req.user.role === "parent") {
        query.studentId = { $in: req.user.linkedStudents || [] };
      } else if (req.user.role === "teacher") {
        query.studentId = { $in: req.user.assignedStudents || [] };
      }
      // Admin without studentId gets all records
    }

    const records = await Record.find(query)
      .populate("studentId", "name email classOrCourse")
      .populate("createdBy", "name role")
      .sort({ date: -1, createdAt: -1 })
      .limit(500);

    res.json({
      records: records.map((r) => ({
        id: r._id,
        type: r.type,
        title: r.title,
        subject: r.subject,
        date: r.date,
        details: r.details,
        score: r.score,
        maxScore: r.maxScore,
        status: r.status,
        priority: r.priority,
        dayOfWeek: r.dayOfWeek,
        timeSlot: r.timeSlot,
        skillLevel: r.skillLevel,
        percentage: r.percentage,
        student: r.studentId
          ? { id: r.studentId._id, name: r.studentId.name, classOrCourse: r.studentId.classOrCourse }
          : null,
        creator: r.createdBy ? { id: r.createdBy._id, name: r.createdBy.name, role: r.createdBy.role } : null,
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

// Create new record
app.post("/api/records", requireAuth, async (req, res, next) => {
  try {
    const {
      type,
      title,
      subject,
      date,
      details,
      score,
      maxScore,
      status,
      priority,
      dayOfWeek,
      timeSlot,
      skillLevel,
      studentId
    } = req.body;

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: "Choose a valid record type (mark, attendance, task, timetable, skill)." });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Record title is required." });
    }

    const targetStudentId = studentId || req.user._id;
    if (!canAccessStudent(req.user, targetStudentId, true)) {
      return res.status(403).json({ error: "You do not have permission to add records for this student." });
    }

    // Validation for marks
    if (type === "mark") {
      if (score === undefined || maxScore === undefined) {
        return res.status(400).json({ error: "Score and maximum score are required for marks." });
      }
      const numScore = Number(score);
      const numMax = Number(maxScore);
      if (isNaN(numScore) || isNaN(numMax) || numMax <= 0 || numScore < 0 || numScore > numMax) {
        return res.status(400).json({ error: "Score must be a valid number between 0 and maximum score." });
      }
    }

    const record = await Record.create({
      studentId: targetStudentId,
      createdBy: req.user._id,
      type,
      title: String(title).trim(),
      subject: String(subject || "").trim(),
      date: date ? new Date(date) : new Date(),
      details: String(details || "").trim(),
      score: type === "mark" ? Number(score) : undefined,
      maxScore: type === "mark" ? Number(maxScore) : undefined,
      status: String(status || (type === "task" ? "Pending" : "")),
      priority: type === "task" ? priority || "Medium" : "",
      dayOfWeek: type === "timetable" ? dayOfWeek || "" : "",
      timeSlot: type === "timetable" ? String(timeSlot || "").trim() : "",
      skillLevel: type === "skill" ? Math.min(100, Math.max(0, Number(skillLevel) || 50)) : undefined
    });

    res.status(201).json({
      message: "Record created successfully",
      record: {
        id: record._id,
        type: record.type,
        title: record.title,
        subject: record.subject,
        date: record.date,
        details: record.details,
        score: record.score,
        maxScore: record.maxScore,
        status: record.status,
        priority: record.priority,
        dayOfWeek: record.dayOfWeek,
        timeSlot: record.timeSlot,
        skillLevel: record.skillLevel,
        percentage: record.percentage
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update record
app.patch("/api/records/:id", requireAuth, async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Record not found." });
    }

    if (!canAccessStudent(req.user, record.studentId, true)) {
      return res.status(403).json({ error: "You cannot edit this record." });
    }

    const updatableFields = [
      "title",
      "subject",
      "date",
      "details",
      "score",
      "maxScore",
      "status",
      "priority",
      "dayOfWeek",
      "timeSlot",
      "skillLevel"
    ];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        record[field] = req.body[field];
      }
    }

    if (record.type === "mark") {
      if (record.maxScore <= 0 || record.score < 0 || record.score > record.maxScore) {
        return res.status(400).json({ error: "Score must be between 0 and maximum score." });
      }
    }

    await record.save();
    res.json({ message: "Record updated successfully." });
  } catch (err) {
    next(err);
  }
});

// Delete record
app.delete("/api/records/:id", requireAuth, async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Record not found." });
    }

    if (!canAccessStudent(req.user, record.studentId, true)) {
      return res.status(403).json({ error: "You cannot delete this record." });
    }

    await record.deleteOne();
    res.json({ message: "Record deleted successfully." });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================================
   DASHBOARD & ANALYTICS ROUTE
   ========================================================================== */

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const { studentId } = req.query;
    let query = {};

    if (studentId) {
      if (!canAccessStudent(req.user, studentId, false)) {
        return res.status(403).json({ error: "Unauthorized access to dashboard data." });
      }
      query.studentId = studentId;
    } else {
      if (req.user.role === "student") {
        query.studentId = req.user._id;
      } else if (req.user.role === "parent") {
        query.studentId = { $in: req.user.linkedStudents || [] };
      } else if (req.user.role === "teacher") {
        query.studentId = { $in: req.user.assignedStudents || [] };
      }
    }

    const records = await Record.find(query).sort({ date: -1, createdAt: -1 }).limit(1000);

    const marks = records.filter((r) => r.type === "mark" && r.maxScore > 0);
    const attendance = records.filter((r) => r.type === "attendance");
    const tasks = records.filter((r) => r.type === "task");
    const timetable = records.filter((r) => r.type === "timetable");
    const skills = records.filter((r) => r.type === "skill");

    // Average mark %
    const average =
      marks.length > 0
        ? Math.round(marks.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) / marks.length)
        : null;

    // Attendance stats
    const presentCount = attendance.filter((r) => String(r.status).toLowerCase() === "present").length;
    const absentCount = attendance.filter((r) => String(r.status).toLowerCase() === "absent").length;
    const lateCount = attendance.filter((r) => String(r.status).toLowerCase() === "late").length;
    const excusedCount = attendance.filter((r) => String(r.status).toLowerCase() === "excused").length;

    const attendanceRate =
      attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : null;

    // Subject breakdown for marks chart
    const subjectMap = {};
    marks.forEach((m) => {
      const subj = m.subject || "General";
      if (!subjectMap[subj]) {
        subjectMap[subj] = { totalPct: 0, count: 0 };
      }
      subjectMap[subj].totalPct += (m.score / m.maxScore) * 100;
      subjectMap[subj].count += 1;
    });

    const subjectBreakdown = Object.keys(subjectMap).map((subj) => ({
      subject: subj,
      average: Math.round(subjectMap[subj].totalPct / subjectMap[subj].count),
      examsCount: subjectMap[subj].count
    }));

    res.json({
      stats: {
        averageMarks: average,
        attendanceRate,
        pendingTasks: tasks.filter((r) => String(r.status).toLowerCase() !== "completed").length,
        completedTasks: tasks.filter((r) => String(r.status).toLowerCase() === "completed").length,
        totalRecords: records.length,
        totalSkills: skills.length,
        totalTimetableSlots: timetable.length
      },
      attendanceSummary: {
        total: attendance.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        excused: excusedCount
      },
      subjectBreakdown,
      recent: records.slice(0, 8).map((r) => ({
        id: r._id,
        type: r.type,
        title: r.title,
        subject: r.subject,
        date: r.date,
        status: r.status,
        score: r.score,
        maxScore: r.maxScore,
        priority: r.priority,
        dayOfWeek: r.dayOfWeek,
        timeSlot: r.timeSlot,
        skillLevel: r.skillLevel
      }))
    });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================================
   ADMIN MANAGEMENT ROUTES
   ========================================================================== */

// Get all users (Admin only)
app.get("/api/admin/users", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Administrator access required." });
    }

    const users = await User.find({})
      .populate("assignedStudents", "name email")
      .populate("linkedStudents", "name email")
      .sort({ createdAt: -1 });

    res.json({
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        educationLevel: u.educationLevel,
        schoolOrCollege: u.schoolOrCollege,
        classOrCourse: u.classOrCourse,
        assignedStudents: u.assignedStudents,
        linkedStudents: u.linkedStudents,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

// Create any user (Admin only)
app.post("/api/admin/users", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Administrator access required." });
    }

    const {
      name,
      email,
      password,
      role,
      educationLevel,
      schoolOrCollege,
      classOrCourse,
      assignedStudents,
      linkedStudents
    } = req.body;

    if (!name || !email || !password || !["student", "teacher", "parent", "admin"].includes(role)) {
      return res.status(400).json({ error: "Name, email, password, and valid role are required." });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "User with this email already exists." });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      educationLevel: ["school", "college"].includes(educationLevel) ? educationLevel : "school",
      schoolOrCollege: String(schoolOrCollege || "").trim(),
      classOrCourse: String(classOrCourse || "").trim(),
      assignedStudents: Array.isArray(assignedStudents) ? assignedStudents : [],
      linkedStudents: Array.isArray(linkedStudents) ? linkedStudents : []
    });

    res.status(201).json({ user: cleanUser(user) });
  } catch (err) {
    next(err);
  }
});

// Update user linkages or info (Admin only)
app.patch("/api/admin/users/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Administrator access required." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { name, role, schoolOrCollege, classOrCourse, educationLevel, assignedStudents, linkedStudents, password } =
      req.body;

    if (name) user.name = String(name).trim();
    if (role && ["student", "teacher", "parent", "admin"].includes(role)) user.role = role;
    if (schoolOrCollege !== undefined) user.schoolOrCollege = String(schoolOrCollege).trim();
    if (classOrCourse !== undefined) user.classOrCourse = String(classOrCourse).trim();
    if (educationLevel && ["school", "college"].includes(educationLevel)) user.educationLevel = educationLevel;
    if (Array.isArray(assignedStudents)) user.assignedStudents = assignedStudents;
    if (Array.isArray(linkedStudents)) user.linkedStudents = linkedStudents;

    if (password && String(password).length >= 8) {
      user.passwordHash = await bcrypt.hash(password, 12);
    }

    await user.save();
    res.json({ message: "User updated successfully.", user: cleanUser(user) });
  } catch (err) {
    next(err);
  }
});

// Delete user and associated records (Admin only)
app.delete("/api/admin/users/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Administrator access required." });
    }

    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot delete your own active administrator account." });
    }

    await User.findByIdAndDelete(req.params.id);
    await Record.deleteMany({ studentId: req.params.id });

    res.json({ message: "User and associated records removed successfully." });
  } catch (err) {
    next(err);
  }
});

// SPA fallback for HTML5 history (skips /api/ calls)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: err.message || "An unexpected internal server error occurred."
  });
});

// MongoDB Connection & Server Startup
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 PROGRESS PATH BY SADAAN SERVER IS ONLINE!`);
      console.log(`   Local URL:    http://localhost:${PORT}`);
      console.log(`   Database:     MongoDB Connected`);
      console.log(`   Environment:  ${process.env.NODE_ENV || "development"}`);
      console.log(`======================================================\n`);
    });
  })
  .catch((err) => {
    console.error("FATAL: MongoDB connection failed:", err.message);
    console.error("Please verify that MongoDB Community Server is started or Atlas URI is correct.");
    process.exit(1);
  });

