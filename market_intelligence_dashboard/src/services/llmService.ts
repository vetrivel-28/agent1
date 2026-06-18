export async function runOllamaSimulation(prompt: string, model: string = 'llama3:latest') {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: {
          temperature: 0,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.message?.content;
    
    if (!content) {
      throw new Error('No content in Ollama response');
    }

    return JSON.parse(content);
  } catch (err) {
    console.error('Ollama simulation failed:', err);
    throw err;
  }
}
