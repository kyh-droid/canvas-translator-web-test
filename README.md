# Canvas Translator Web

Automated StoryChat canvas translation system using Google Forms + GitHub Actions + MongoDB import.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Google Form                                 │
│  User uploads: JSON file + Target language + User UID           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ On Submit
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Google Apps Script                             │
│  - Validates User UID format                                    │
│  - Makes file accessible                                        │
│  - Triggers GitHub Actions                                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ repository_dispatch
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GitHub Actions                                 │
│  1. Downloads file from Google Drive                            │
│  2. Translates using Claude API                                 │
│  3. Imports directly to user's MongoDB account                  │
│     → Canvas appears in user's StoryChat!                       │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Create Google Form

Create a Google Form with these fields:
- **Canvas JSON File** - File upload (accepts .json)
- **Target Language** - Dropdown (English, Korean, Japanese)
- **User UID** - Short answer (24-character hex MongoDB ObjectId)

### 2. Set up Google Apps Script

1. Open the form's linked Google Sheet (Responses tab → Sheets icon)
2. Go to **Extensions > Apps Script**
3. Copy the code from `apps-script/Code.gs`
4. Update CONFIG with your GitHub token
5. Click the clock icon → **Add Trigger** → `onFormSubmit` on form submit

### 3. Configure GitHub Repository Secrets

Go to https://github.com/YOUR-USERNAME/canvas-translator-web-test/settings/secrets/actions

Add these secrets:

| Secret Name | Description |
|-------------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Entire JSON from Google service account |
| `ANTHROPIC_API_KEY` | Your Claude API key (`sk-ant-...`) |
| `MONGO_URI_3` | MongoDB connection string |

### 4. Create Google Service Account

1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable Google Drive API
4. Create a service account
5. Download the JSON key
6. Add the entire JSON as `GOOGLE_SERVICE_ACCOUNT_JSON` secret

### 5. Share Drive Folder

The uploaded files go to a Google Drive folder. Share it with the service account email (found in the JSON key).

## Supported Languages

- English (en)
- Korean (ko)
- Japanese (ja)

## How It Works

1. User exports canvas from StoryChat as JSON
2. User submits form with JSON file, target language, and their User UID
3. System automatically translates all text content
4. Translated canvas is imported directly to user's account
5. User sees the new canvas in their StoryChat dashboard

## Cost

| Service | Cost |
|---------|------|
| Google Forms | Free |
| Google Drive | Free (15GB) |
| Google Apps Script | Free |
| GitHub Actions | Free (2000 min/month) |
| Claude API | ~$0.01-0.05 per canvas |
| MongoDB | Existing infrastructure |

## Files

```
canvas-translator-web-test/
├── apps-script/
│   └── Code.gs              # Google Apps Script
├── processor/
│   ├── src/
│   │   ├── main.js          # Entry point
│   │   ├── drive.js         # Google Drive download
│   │   ├── translate.js     # Claude API translation
│   │   └── mongodb-import.js # MongoDB import
│   └── package.json
├── .github/workflows/
│   └── canvas-translator.yml
└── README.md
```
