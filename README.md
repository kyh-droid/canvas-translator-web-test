# Canvas Translator Web

Automated StoryChat canvas translation system using Google Forms + GitHub Actions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Google Form                                 │
│  User uploads: JSON file + Target language + Email              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ On Submit
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Google Apps Script                             │
│  - Saves file to Google Drive                                   │
│  - Triggers GitHub Actions via repository_dispatch              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Webhook
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GitHub Actions                                 │
│  1. Downloads file from Google Drive                            │
│  2. Extracts translatable content                               │
│  3. Translates using Claude API                                 │
│  4. Merges translations back                                    │
│  5. Sends result via email (Mailgun)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Create Google Form

Create a Google Form with:
- **File upload** field (accepts .json)
- **Target Language** dropdown (English, Korean, Japanese)
- **Email** short answer field

### 2. Set up Google Apps Script

1. Open the linked Google Sheet
2. Extensions > Apps Script
3. Copy the code from `apps-script/Code.gs`
4. Add your GitHub token and repo info
5. Set up trigger: On Form Submit

### 3. Configure GitHub Repository

Add these secrets in Settings > Secrets:
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials (entire JSON)
- `ANTHROPIC_API_KEY` - Claude API key
- `MAILGUN_API_KEY` - Mailgun API key
- `MAILGUN_DOMAIN` - Mailgun domain (e.g., rplay.live)

### 4. Share Google Drive Folder

Share the Drive folder containing uploaded files with the service account email.

## Supported Languages

- English (en)
- Korean (ko)
- Japanese (ja)

## Cost

| Service | Cost |
|---------|------|
| Google Forms | Free |
| Google Drive | Free (15GB) |
| Google Apps Script | Free |
| GitHub Actions | Free (2000 min/month) |
| Claude API | ~$0.01-0.05 per canvas |
| Mailgun | Free (5000 emails/month) |
