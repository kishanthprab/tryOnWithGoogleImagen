# Virtual Try-On Application

A web application that allows users to virtually try on garments using Google's Virtual Try-On API.

## Features

- Upload full-body person images and garment images
- Automatic image validation and preprocessing
- Background removal for garments
- Image resizing to 512x512 for API compatibility
- Side-by-side comparison of original and try-on results
- Multiple garment support without re-uploading person image
- Zoom functionality for detailed viewing
- Download try-on results
- Responsive design

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up Google Cloud credentials:
```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
```

3. Run the application:
```bash
python app.py
```

4. Open browser to `http://localhost:5000`

## Usage

1. Upload a full-body image of a person
2. Upload one or more garment images
3. Click "Try On" to generate the result
4. View comparison, zoom, and download the result
5. Switch between multiple garments without re-uploading person image

## Requirements

- Python 3.8+
- Google Cloud Project with Virtual Try-On API enabled
- Service account with appropriate permissions

## API Configuration

The application uses Google Vertex AI Virtual Try-On API. Ensure:
- API is enabled in your Google Cloud project
- Endpoint is properly configured
- Service account has necessary permissions

## Error Handling

- Invalid image formats are rejected
- Person images must be full-body (height > width * 1.2)
- Garment images must be at least 100x100 pixels
- API errors are displayed to users with retry options
- Graceful handling of network issues and API downtime
