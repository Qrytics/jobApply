# jobApply

**jobApply** is a Chrome browser extension that speeds up the job application process. Save your profile information once, then auto-fill job application forms on any website with a single click.

---

## Features

- **Profile Storage** – Save personal, professional, and online presence information locally in your browser.
- **One-Click Auto-Fill** – Automatically populate form fields on any job application page.
- **Smart Field Detection** – Matches fields using labels, placeholders, `aria-label` attributes, IDs, and surrounding text.
- **Custom Rules** – Define your own keyword-to-value rules with `contains`, `exact`, or `starts with` matching.
- **Cover Letter Support** – Store a cover letter template that gets auto-filled when a cover letter field is detected.
- **Social Links** – Store and auto-fill LinkedIn, GitHub, and portfolio URLs.
- **Privacy-First** – All data is stored locally in your browser. Nothing is sent to any server.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | JavaScript (Vanilla) |
| Platform | Chrome Extension (Manifest V3) |
| UI | HTML5, CSS3 |
| Storage | Chrome Storage API (local) |
| Backend | None – fully client-side |

---

## Project Structure

```
jobApply/
├── manifest.json     # Chrome Extension manifest (Manifest V3)
├── popup.html        # Extension popup UI (tabbed: Profile & Rules)
├── popup.js          # Core logic: profile management, rules, and form-filling script injection
├── styles.css        # Popup UI styling
├── icons/
│   ├── icon16.png    # 16×16 toolbar icon
│   ├── icon48.png    # 48×48 icon
│   └── icon128.png   # 128×128 icon
└── README.md
```

---

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Qrytics/jobApply.git
   ```

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer mode** using the toggle in the top-right corner.

4. Click **"Load unpacked"** and select the `jobApply` directory.

5. The **jobApply** icon will appear in your Chrome toolbar.

---

## How to Use

1. Click the **jobApply** icon in the Chrome toolbar to open the popup.
2. Go to the **Profile** tab and fill in your information, then click **Save Profile**.
3. *(Optional)* Go to the **Rules** tab to add custom keyword-matching rules.
4. Navigate to any job application page.
5. Click **"Fill Fields on This Page"** – the extension will auto-populate all matching fields.

---

## Profile Fields

The following fields are stored and used for auto-filling:

| Category | Fields |
|----------|--------|
| Personal | First Name, Last Name, Email, Phone, Address, City, State, ZIP Code |
| Professional | Job Title, Current Company, Years of Experience, Expected Salary |
| Online Presence | LinkedIn URL, GitHub URL, Portfolio/Website URL |
| Other | Cover Letter |

---

## Custom Rules

In the **Rules** tab, you can create rules to handle fields that aren't covered by the built-in defaults.

Each rule has three parts:

| Property | Description |
|----------|-------------|
| **Keyword** | The text to look for in a field's label or placeholder (e.g., `work authorization`) |
| **Value** | The value to fill in when the keyword is matched (e.g., `Yes, I am authorized to work`) |
| **Match Type** | How the keyword is matched: `Contains`, `Exact`, or `Starts with` |

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save and load your profile and custom rules |
| `activeTab` | Access the currently open tab for form filling |
| `scripting` | Inject the form-filling script into job application pages |

---

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to your branch: `git push origin feature/your-feature-name`
5. Open a Pull Request.

