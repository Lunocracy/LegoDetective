# 🚀 Recursi ➔ Luno Migration & Automation Protocol

**Document ID**: `RECURSI_TO_LUNO_MIGRATION_GUIDE`  
**Target Topology**: Flat Peer Workspace (`/storage/emulated/0/Luno/web/<ProjectName>/`)  
**Host Engine**: Luno Workspace (`LunoLoader` + `DomBasics.js` + `ThreeJSLoader.js` / `UITools.js`)  
**Date**: August 2026  

---

## 1. Executive Summary & Core Mandate

When migrating projects from legacy **Recursi** (`/storage/emulated/0/web/<project>/`) to **Luno Workspace**:
1. **Never alter the original project's game mechanics, math, or business logic.**
2. Transition the loader architecture from `recursi.js` to `LunoLoader.js`.
3. Standardize manifest definitions from `files.json` to `luno.json`.
4. Enforce strict ES6 class exports and clean DOM lifecycle hooks (`run(env)` / `destroy()`).

---

## 2. Directory & Topology Rules

- **Source Location**: `/storage/emulated/0/web/<project_name>/`
- **Destination Location**: `/storage/emulated/0/Luno/web/<PascalCaseProjectName>/`
- Each migrated project lives as a **first-class peer sibling** next to `Luno`, `Basic3D`, `MySituation`, and `Library/`.
- Sibling apps must **never** be placed inside the `Luno/` directory.

---

## 3. The 6 Critical Invariants & Lessons Learned

### 3.1. The Duplicate Script Declaration Trap
- **The Issue**: In ES6, loading a script with top-level `class ClassName` or `const ClassName` twice throws `Uncaught SyntaxError: Identifier 'ClassName' has already been declared`.
- **The Rule**: `index.html` must **only** load `../Library/DomBasics.js` and `../Library/LunoLoader.js`.
- **Never** add direct `<script src="../Library/ThreeJSLoader.js">` or `<script src="../Library/UITools.js">` in `index.html` if they are already declared in `luno.json["library"]`. `LunoLoader.loadApp()` handles loading libraries in sequence.

```html
<!-- ✅ CORRECT Luno index.html Shell -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ProjectName</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="../Library/DomBasics.js">