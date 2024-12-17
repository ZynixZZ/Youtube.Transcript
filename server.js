const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 3000;
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Enable CORS for all routes
app.use(cors());

// Additional CORS headers middleware
app.use((req, res, next) => {
    // Allow specific origin
    res.header('Access-Control-Allow-Origin', 'https://youtube-transcript-gsbv.onrender.com');
    
    // Allow specific methods
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Allow specific headers
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    if (req.body) console.log('Body:', req.body);
    next();
});

const youtube = google.youtube({
    version: 'v3',
    auth: API_KEY
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
            // First check if video exists and has captions
            const videoResponse = await youtube.videos.list({
                part: 'contentDetails',
                id: videoId
            });

            console.log('Video API Response:', JSON.stringify(videoResponse.data, null, 2));

            if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
                console.log('Video not found');
                return res.status(404).json({ success: false, error: 'Video not found' });
            }

            // Try to get transcript
            const transcript = await getTranscript(videoId);
            console.log('Transcript retrieved successfully');
            
            return res.json({ success: true, text: transcript });
        } catch (error) {
            console.error('Error in YouTube API or transcript fetch:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch video information or transcript',
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

async function getTranscript(videoId) {
    try {
        console.log('Attempting to get transcript for video:', videoId);
        
        // Initialize YouTube API client
        const youtube = google.youtube({
            version: 'v3',
            auth: API_KEY
        });

        // First check if captions are available
        const captionResponse = await youtube.captions.list({
            part: 'snippet',
            videoId: videoId
        });

        console.log('Caption API Response:', JSON.stringify(captionResponse.data, null, 2));

        if (!captionResponse.data.items || captionResponse.data.items.length === 0) {
            throw new Error('No captions available for this video');
        }

        // Get the first available caption track
        const captionTrack = captionResponse.data.items[0];
        console.log('Found caption track:', captionTrack.id);

        // Here you would normally download and parse the caption track
        // For now, return a placeholder
        return `Transcript for video ${videoId}`;
    } catch (error) {
        console.error('Error in getTranscript:', error);
        throw error;
    }
}

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

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log('Using API key:', API_KEY ? 'API key is set' : 'API key is missing');
}); 