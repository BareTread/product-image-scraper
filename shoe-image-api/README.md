# Barefoot Shoe Image API

A simple, robust, and reliable API for retrieving product images of barefoot shoes, powered by AI-driven web automation.

## Features
- **Multi-Source Scraping**: Prioritizes high-quality retailers (Zappos, Amazon) before falling back to search engines.
- **AI-Powered**: Uses `@browserbasehq/stagehand` to intelligently navigate websites, eliminating brittle selectors.
- **Smart Validation**: Automatically validates images to ensure they are product photos, not lifestyle shots.
- **Persistent Caching**: Caches successful results to disk, making subsequent requests for the same model instantaneous.
- **Simple REST API**: A clean, straightforward API endpoint.

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
    Open `.env` and add your Google Gemini API key.

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
  "source": "retailer",
  "imageUrl": "http://localhost:3000/images/vivobarefoot_primus_lite_iii_abcdef12.jpg"
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

To run a quick test against a predefined list of shoe models, first start the server (`npm run dev`) and then, in a separate terminal, run:

```bash
npm run test
```
