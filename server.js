// Load environment variables from the .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Use CORS to allow requests from your frontend (which runs on a different port)
app.use(cors());

// A helper function to get a fresh access token from QuickBooks
async function getQuickBooksAccessToken() {
  const { QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN } = process.env;

  if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET || !QUICKBOOKS_REFRESH_TOKEN) {
    throw new Error("QuickBooks credentials are not set in the .env file.");
  }

  // QuickBooks requires credentials to be Base64 encoded for the token request
  const auth = Buffer.from(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`).toString('base64');
  
  try {
    const response = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      `grant_type=refresh_token&refresh_token=${QUICKBOOKS_REFRESH_TOKEN}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Error refreshing QuickBooks token:", error.response ? error.response.data : error.message);
    throw new Error('Could not refresh QuickBooks token.');
  }
}

// Define the API endpoint that your frontend will call
app.get('/api/quickbooks-payments', async (req, res) => {
  try {
    const accessToken = await getQuickBooksAccessToken();
    const { QUICKBOOKS_REALM_ID } = process.env;
    
    // Determine the base URL (Sandbox or Production)
    // Note: The token refresh URL is always the same.
    const QB_BASE_URL = process.env.NODE_ENV === 'production' 
      ? 'https://quickbooks.api.intuit.com' 
      : 'https://sandbox-quickbooks.api.intuit.com';

    // Query for all payments made in the last year
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
    const query = `SELECT * FROM Payment WHERE TxnDate >= '${oneYearAgo}'`;

    const response = await axios.get(
      `${QB_BASE_URL}/v3/company/${QUICKBOOKS_REALM_ID}/query?query=${encodeURIComponent(query)}&minorversion=65`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const payments = response.data.QueryResponse?.Payment || [];
    res.json(payments);

  } catch (error) {
    console.error("QuickBooks API Error:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch data from QuickBooks.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`QuickBooks backend server running on http://localhost:${PORT}`);
});
