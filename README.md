# Public Figure Spotter

Identify public figures in live camera feed, still images, and video. When a person is recognized, the app automatically opens their Wikipedia page in your browser language.

## Features

- **Camera mode** — point your phone or webcam at a screen, poster, or photo
- **Image / video upload** — analyze files from your device
- **Celebrity recognition** — powered by AWS Rekognition (production) or a mock provider (development)
- **Localized Wikipedia** — uses your browser language (`navigator.language`) to find the right article
- **Auto-open** — optionally opens Wikipedia in a new tab when someone is identified

## Quick start

```bash
cd public-figure-spotter
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Copy env and use mock mode (no AWS needed for UI testing)
copy .env.example .env

# Run both client and server
npm run dev
```

Open **http://localhost:5173** in your browser. Allow camera access when prompted.

## Production recognition (AWS Rekognition)

1. Create an AWS account and IAM user with `rekognition:RecognizeCelebrities` permission.
2. Copy `.env.example` to `.env` and set:

```env
RECOGNITION_PROVIDER=aws
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
MIN_CONFIDENCE=85
```

AWS Rekognition includes a free tier for new accounts (see [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/)).

## How it works

1. The client captures frames from the camera, image, or video every 2 seconds.
2. Frames are sent to the backend as base64 JPEG.
3. The backend runs celebrity recognition and returns matches above the confidence threshold.
4. For each match, the server searches Wikipedia in the user's language and returns the article URL.
5. If auto-open is enabled, Wikipedia opens in a new tab (with a 15-second cooldown per person to avoid spam).

## Project structure

```
public-figure-spotter/
├── client/          # Vite + React frontend
├── server/          # Express API (recognition + Wikipedia)
└── .env.example
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client (5173) and server (3001) |
| `npm run build` | Build for production |
| `npm start` | Serve built client + API on port 3001 |

## Privacy note

Images are sent to your backend for recognition. With AWS enabled, frames are also sent to Amazon Rekognition. Do not use this app to identify private individuals without consent.
