
const API_URL = 'http://localhost:3002';
const API_KEY = 'firecrawl_n8n_master_key';

async function run() {
    try {
        console.log('1. Posting to /agent...');
        const postResponse = await fetch(`${API_URL}/agent`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: "Who is Hugo Cardellach Martin?"
            })
        });

        const postData = await postResponse.json();
        console.log(`POST Response: ${postResponse.status}`);
        const jobId = postData.id || postData.jobId;

        if (!jobId) {
            console.error('No job ID returned', postData);
            return;
        }
        console.log('Job ID:', jobId);

        // Poll for a bit to allow the worker to pick up the job and log the config
        console.log('Waiting for job to process...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const checkStatus = async () => {
            const res = await fetch(`${API_URL}/v2/agent/${jobId}`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            const data = await res.json();
            console.log('Job Status:', data.status);
            if (data.status === 'failed') {
                console.log('Error:', data.error);
            }
            return data.status;
        };

        let status = await checkStatus();
        while (status === 'processing' || status === 'active') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            status = await checkStatus();
        }

    } catch (error) {
        console.error('Top level error:', error.message);
    }
}

run();
