// Load environment variables from .env file for local development
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 10000;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { YoutubeTranscript } = require('youtube-transcript');

// Log environment variables at startup
console.log('=== Environment Check ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('YOUTUBE_API_KEY exists:', !!process.env.YOUTUBE_API_KEY);
console.log('YOUTUBE_API_KEY length:', process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.length : 0);
console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
console.log('=====================');

// Load API keys from environment variables
const API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate API keys
if (!API_KEY) {
    console.error('ERROR: YOUTUBE_API_KEY is not set in environment variables');
}

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
}

// Configure CORS - this must be the first middleware
const corsOptions = {
    origin: [
        'http://localhost:10000',
        'http://127.0.0.1:10000',
        'https://youtube-transcript-gsbv.onrender.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    optionsSuccessStatus: 200
};

// Apply CORS middleware first
app.use(cors(corsOptions));

// Then parse JSON
app.use(express.json());

// Then serve static files
app.use(express.static('.'));

// Request logging middleware
app.use((req, res, next) => {
    console.log('=== Incoming Request ===');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Method: ${req.method}`);
    console.log(`Path: ${req.path}`);
    console.log(`Origin: ${req.headers.origin}`);
    console.log(`Headers:`, req.headers);
    if (req.body) console.log(`Body:`, req.body);
    console.log('=====================');
    next();
});

const youtube = google.youtube({
    version: 'v3',
    auth: API_KEY
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function getTranscript(videoId) {
    try {
        console.log('Attempting to get transcript for video:', videoId);
        
        // Initialize YouTube API client for video details
        const youtube = google.youtube({
            version: 'v3',
            auth: API_KEY
        });

        // First get video details
        const videoResponse = await youtube.videos.list({
            part: 'snippet',
            id: videoId
        });

        if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
            throw new Error('Video not found');
        }

        const videoTitle = videoResponse.data.items[0].snippet.title;
        console.log('Found video:', videoTitle);

        // Get transcript using youtube-transcript
        console.log('Fetching transcript...');
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        
        if (!transcriptItems || transcriptItems.length === 0) {
            throw new Error('No transcript available for this video');
        }

        console.log('Transcript found with', transcriptItems.length, 'segments');
        const transcriptText = transcriptItems.map(item => item.text).join(' ');

        return {
            text: transcriptText,
            videoTitle: videoTitle
        };
    } catch (error) {
        console.error('Error in getTranscript:', error);
        throw error;
    }
}

app.post('/api/convert', async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        const { videoId } = req.body;

        if (!videoId) {
            console.log('No videoId provided');
            return res.status(400).json({ success: false, error: 'No video ID provided' });
        }

        console.log('Processing video ID:', videoId);
        console.log('Using API key:', API_KEY ? 'Present' : 'Missing');

        try {
            // Get transcript and video details
            const { text, videoTitle } = await getTranscript(videoId);
            console.log('Transcript retrieved successfully');
            
            return res.json({ 
                success: true, 
                text: text,
                videoTitle: videoTitle
            });
        } catch (error) {
            console.error('Error in transcript fetch:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch transcript',
                details: error.message 
            });
        }
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

app.post('/api/ask-ai', async (req, res) => {
    try {
        const { question, transcript, history } = req.body;
        
        // Initialize the model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Create the context from conversation history
        let conversationContext = '';
        if (history && history.length > 0) {
            conversationContext = 'Previous conversation:\n' + 
                history.map(msg => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`).join('\n') +
                '\n\nNow, ';
        }

        // Create the prompt with context
        const prompt = `Based on this video transcript: "${transcript.substring(0, 5000)}..."
                       ${conversationContext}please answer this question: ${question}
                       Please provide a clear and concise response based on the video content. Make it 3-4 sentences.`;

        // Generate response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({
            success: true,
            answer: text
        });
    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const { text } = req.body;
        
        // Initialize the model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Create the prompt
        const prompt = `Please provide a concise summary of the following text: ${text.substring(0, 5000)}...`;

        // Generate summary
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        res.json({
            success: true,
            summary: summary
        });
    } catch (error) {
        console.error('Summarization Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/expand-summary', async (req, res) => {
    try {
        const { text, currentSummary } = req.body;
        
        // Initialize the model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Create the prompt
        const prompt = `Based on this video transcript: "${text.substring(0, 5000)}..."
                       
                       Current summary: "${currentSummary}"
                       
                       Please add 2 sentences that provide additional details, specific examples, or key concepts that weren't mentioned in the current summary. 
                       Focus on interesting or important information that adds value to the summary.
                       Do not repeat information that's already in the summary.
                       Return the complete text (current summary + new detailed sentences).
                       Make the transition between the current summary and new information smooth.`;

        // Generate response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const expandedSummary = response.text();

        res.json({
            success: true,
            summary: expandedSummary
        });
    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware (should be last)
app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log('Using API key:', API_KEY ? 'API key is set' : 'API key is missing');
}); 