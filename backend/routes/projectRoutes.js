import express from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Create new project
router.post("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "startup") {
      return res.status(403).json({ message: "Only startups can publish projects" });
    }
    const { title, description, requiredSkills } = req.body;

    const project = new Project({
      title,
      description,
      requiredSkills,
      startupId: req.user._id, // comes from JWT
      companyName: req.user.startupProfile.companyName, // auto-added
    });

    await project.save();
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get all projects of the logged-in startup
router.get("/mine", protect, async (req, res) => {
  try {
    const projects = await Project.find({ startupId: req.user._id });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get projects matching learner's skills
router.get("/match", protect, async (req, res) => {
  try {
    if (req.user.role !== "learner") {
      return res
        .status(403)
        .json({ message: "Only learners can view matching projects" });
    }

    const learnerSkills = req.user.learnerProfile?.skills || [];
    if (!learnerSkills.length) {
      return res.json([]);
    }

    // Find projects where requiredSkills overlaps with learner's skills
    const projects = await Project.find({
      requiredSkills: { $in: learnerSkills },
    }).select("-applicants");

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Apply to a project
router.post("/:id/apply", protect, async (req, res) => {
  try {
    if (req.user.role !== "learner") {
      return res.status(403).json({ message: "Only learners can apply" });
    }

    const projectId = req.params.id;
    if (!mongoose.isObjectIdOrHexString(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const learnerId = req.user._id;
    const result = await Project.updateOne(
      { _id: projectId, "applicants.learnerId": { $ne: learnerId } },
      { $push: { applicants: {
        learnerId,
        learnerName: req.user.name,
        learnerEmail: req.user.email,
        appliedAt: new Date(),
      } } },
      { runValidators: true }
    );
    if (!result.matchedCount) {
      if (await Project.exists({ _id: projectId })) {
        return res.status(400).json({ message: "Already applied" });
      }
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ message: "Applied successfully", projectId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get projects learner applied to
router.get("/applied/mine", protect, async (req, res) => {
  try {
    if (req.user.role !== "learner") {
      return res
        .status(403)
        .json({ message: "Only learners can view applied projects" });
    }

    const projects = await Project.find({
      "applicants.learnerId": req.user._id,
    }).select("-applicants");

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Withdraw from a project
router.post("/:id/withdraw", protect, async (req, res) => {
  try {
    if (req.user.role !== "learner") {
      return res.status(403).json({ message: "Only learners can withdraw" });
    }

    const projectId = req.params.id;
    if (!mongoose.isObjectIdOrHexString(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const result = await Project.updateOne(
      { _id: projectId },
      { $pull: { applicants: { learnerId: req.user._id } } }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ message: "Withdrawn successfully", projectId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { skill, companyName } = req.query;
    if ([skill, companyName].some(value => value !== undefined && (typeof value !== "string" || value.length > 100))) {
      return res.status(400).json({ message: "Filters must be text of up to 100 characters" });
    }

    let filters = {};

    if (skill) {
      filters.requiredSkills = { $in: [skill] };
    }
    if (companyName) {
      const fragment = companyName.replace(/[.*+?^$\x7B\x7D()|\[\]\\]/g, '\\filters.companyName = { $regex: companyName, $options: "i" };');
      filters.companyName = { $regex: fragment, $options: "i" };
    }

    let query = Project.find(filters).select("-applicants");

    const projects = await query.sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
