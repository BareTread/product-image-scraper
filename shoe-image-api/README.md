# Barefoot Shoe Image API

A simple, robust, and reliable API for retrieving product images of barefoot shoes, powered by AI-driven web automation and validation.

## Features

- **AI-Powered Scraping**: Uses `@browserbasehq/stagehand` to intelligently navigate Bing Images, eliminating brittle selectors and ensuring a consistent source of image candidates.
- **Two-Stage Smart Validation**:
  1.  **Structural Check**: Uses `sharp` to analyze image borders, ensuring a clean, white background typical of product photos.
  2.  **Semantic Check**: Uses the **Google Gemini 1.5 Flash** vision model to confirm the image content semantically matches the requested shoe model, preventing incorrect images (e.g., animals, scenery).
- **Persistent Caching**: Caches validated images to disk (`public/images`), making subsequent requests for the same model instantaneous.
- **Reliable & Self-Healing**: The Stagehand browser instance is managed as a singleton with a recovery mechanism to handle crashes, and the test suite is designed to be robust against common issues like port conflicts.
- **Simple REST API**: A clean, straightforward API endpoint for easy integration.

## Setup

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure environment:**
    Copy `.env.example` to a new file named `.env`.
    ```bash
    cp .env.example .env
    ```
    Open `.env` and add your Google Generative AI API key. This key is used for both Stagehand and Gemini.
    ```
    GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
    ```

4.  **Run the server in development mode:**
    This will use `nodemon` to automatically restart on file changes.
    ```bash
    npm run dev
    ```
    The server will start on `http://localhost:3000`.

## API Usage

### Get a Shoe Image

Send a `POST` request to the `/api/shoe-image` endpoint.

**Example using cURL:**
```bash
curl -X POST http://localhost:3000/api/shoe-image \
  -H "Content-Type: application/json" \
  -d '{"model": "Vivobarefoot Primus Lite III"}'
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "model": "Vivobarefoot Primus Lite III",
  "source": "search-engine",
  "imageUrl": "http://localhost:3000/images/vivobarefoot-primus-lite-iii.jpg"
}
```

**Failure Response (404 Not Found):**

```json
{
  "success": false,
  "model": "An obscure, non-existent shoe",
  "error": "No valid product image found from any source."
}
```

## Running the Test Suite

To run the integration test suite against a predefined list of 7 shoe models, simply run:

```bash
npm run test
```

The test script automatically handles starting and stopping the server on a random available port, so there is no need to run the server in a separate terminal.
