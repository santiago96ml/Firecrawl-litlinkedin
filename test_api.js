const http = require('http');

const API_KEY = 'firecrawl_n8n_master_key';
const BASE_URL = 'http://localhost:3002';

async function testEndpoint(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`TEST ${method} ${path}`);
                console.log(`Status: ${res.statusCode}`);
                try {
                    const json = JSON.parse(data);
                    console.log(`Response: ${JSON.stringify(json, null, 2)}`);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    console.log(`Response (text): ${data}`);
                    resolve({ status: res.statusCode, data: data });
                }
                console.log('-------------------');
            });
        });

        req.on('error', (e) => {
            console.error(`Error testing ${path}: ${e.message}`);
            reject(e);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('Starting Firecrawl API Verification...\n');

    // 1. Account
    await testEndpoint('GET', '/v1/team/credit-usage');

    // 2. Scrape
    const scrapeRes = await testEndpoint('POST', '/v1/scrape', { url: 'https://example.com' });

    // 3. Crawl
    const crawlRes = await testEndpoint('POST', '/v1/crawl', { url: 'https://example.com', limit: 1 });
    if (crawlRes.data && crawlRes.data.jobId) {
        await testEndpoint('GET', `/v1/crawl/${crawlRes.data.jobId}`);
    }

    // 4. Map
    await testEndpoint('POST', '/v1/map', { url: 'https://example.com' });

    // 5. Search
    await testEndpoint('POST', '/v1/search', { query: 'firecrawl' });

    // 6. Extract (V2) - Testing compatibility middleware (url -> urls)
    await testEndpoint('POST', '/extract', { url: 'https://example.com', prompt: 'extract title' });

    // 7. Agent (V2) - Testing compatibility middleware + fallback
    await testEndpoint('POST', '/agent', { url: 'https://example.com', prompt: 'what is the title?' });

    console.log('Verification finished.');
}

runTests().catch(console.error);
