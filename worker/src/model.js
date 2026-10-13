const MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
export const OUTPUT_CAP = 900;

export function gradeRequest(messages) {
  return {
    model: MODEL,
    messages,
    temperature: 0,
    max_tokens: OUTPUT_CAP,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" }
  };
}

export async function gradeTranscripts(env, messages, fetchImpl) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GRADE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(gradeRequest(messages))
  });
  if (!res.ok) throw new Error("grade");
  const json = await res.json();
  const text = json && json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : "";
  const usage = json && json.usage ? json.usage : {};
  return {
    parsed: JSON.parse(String(text || "")),
    usage: {
      hit: Number(usage.prompt_cache_hit_tokens || 0),
      miss: Number(usage.prompt_cache_miss_tokens || 0),
      output: Number(usage.completion_tokens || 0)
    }
  };
}
