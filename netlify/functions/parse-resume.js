exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { resumeText } = JSON.parse(event.body);

    const prompt = `You are a resume parser. Extract the following structured JSON from the pasted resume text.
Return ONLY valid JSON, no preamble, no markdown fences.

Schema:
{
  "name": "string",
  "contact": {
    "phone": "string",
    "email": "string",
    "location": "string (City, ST)",
    "linkedin": "string (URL or handle)",
    "website": "string"
  },
  "summary": {
    "tagline": "string (one short italic line)",
    "bullets": ["string"],
    "skills": ["string"]
  },
  "experience": [{
    "title": "string",
    "company": "string",
    "location": "string",
    "start": "string",
    "end": "string",
    "summary": "string",
    "bullets": ["string"]
  }],
  "education": [{
    "degree": "string",
    "school": "string",
    "location": "string",
    "date": "string",
    "honors": "string"
  }],
  "certifications": [{"name": "string", "org": "string", "date": "string"}],
  "projects": [{"name": "string", "description": "string", "bullets": ["string"]}],
  "awards": ["string"]
}

If a field is missing, use empty string or empty array. Do not invent content.
Resume text:
${resumeText}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: clean })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
