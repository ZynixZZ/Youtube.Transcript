# YouTube Transcript and AI Analysis Tool

A web application that extracts transcripts from YouTube videos and provides AI-powered analysis and conversation capabilities.

## Features

- Extract transcripts from YouTube videos
- AI-powered conversation about video content
- Clean, modern user interface
- Copy transcript to clipboard functionality

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   YOUTUBE_API_KEY=your_youtube_api_key
   GEMINI_API_KEY=your_gemini_api_key
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Environment Variables

- `YOUTUBE_API_KEY`: Your YouTube Data API v3 key
- `GEMINI_API_KEY`: Your Google Gemini API key

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- APIs: YouTube Data API v3, Google Gemini AI
- Dependencies: youtube-transcript, youtube-caption-extractor

## Development

Make sure to:
1. Enable YouTube Data API v3 in Google Cloud Console
2. Set up proper CORS configuration for production
3. Configure environment variables in your deployment platform
