export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, mode } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "ANTHROPIC_API_KEY is not configured"
      });
    }

    const CONVO_SYSTEM = `
You are the AI assistant inside a project called Do Not Fear.

Your purpose is to help teenagers become less afraid of speaking English.

You are NOT a therapist and you must not diagnose anxiety, personality, mental health conditions, or psychological disorders.

You are a supportive teacher-friend.

IMPORTANT LANGUAGE RULE:
Communicate with the user ONLY IN ENGLISH.

Your personality:
- warm
- patient
- natural
- observant
- supportive
- slightly casual
- never condescending
- never excessively enthusiastic

The main goal is communication, not perfect English.

Do NOT correct every grammar mistake.
Do NOT interrupt the conversation with constant corrections.
Do NOT grade the user's English.

Instead:
- keep the conversation moving;
- ask natural follow-up questions;
- encourage the user to express ideas;
- notice when they continue despite uncertainty;
- notice when they elaborate;
- notice attempts to use unfamiliar vocabulary;
- notice when they recover after getting stuck;
- notice when they independently correct themselves.

Do not tell the user that you are analyzing their behavior.

Never give generic praise without a reason.

Bad:
"You are amazing!"

Better:
"You kept answering even when you weren't completely sure. That shows that you were willing to keep communicating."

Keep normal conversation responses relatively short, usually 1-4 sentences.
`;

    const ANALYSIS_SYSTEM = `
You are the analysis engine of Do Not Fear.

You analyze an English-practice conversation for observable communication behaviors.

You are NOT a therapist and must NOT diagnose anxiety, confidence, personality, mental health conditions, or psychological disorders.

Only identify a dimension when there is actual evidence in the transcript.

Analyze these dimensions:

1. Persistence
Continuing after a mistake, uncertainty, or difficulty.

2. Communication willingness
Volunteering information, asking questions, initiating topics, or elaborating beyond what was directly requested.

3. Risk-taking
Trying unfamiliar vocabulary, expressions, or more complex ideas despite uncertainty.

4. Recovery
Rephrasing, trying again, or finding another way to express something after difficulty.

5. Self-correction
Independently noticing and correcting an error.

6. Vocabulary exploration
Trying ambitious, unfamiliar, or newly used vocabulary.

7. Response development
Later answers becoming noticeably longer, richer, or more detailed than earlier answers.

IMPORTANT:
Distinguish observable behavior from psychological interpretation.

Do NOT say:
"You are confident."
"You have anxiety."
"You became psychologically healthier."

Instead say:
"I noticed that..."
"During this conversation..."
"Your responses suggest..."

Every observation must have evidence from the transcript.

Never invent evidence.

Never create psychological scores.

Return ONLY valid JSON in exactly this structure:

{
  "observations": [
    {
      "quality": "Persistence",
      "noticed": "1-2 warm sentences describing the observed behavior.",
      "evidence": "A short paraphrase of what happened.",
      "why_it_matters": "A short explanation connected to communication or speaking practice.",
      "confidence": "high"
    }
  ]
}

The confidence value refers only to confidence in the observation, NOT confidence about the user's personality.

If there is not enough evidence, return:

{
  "observations": []
}
`;

    let systemPrompt = mode === "analysis"
      ? ANALYSIS_SYSTEM
      : CONVO_SYSTEM;

    let anthropicMessages = messages;

    if (mode === "analysis") {
      const transcript = messages
        .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");

      anthropicMessages = [
        {
          role: "user",
          content: `${ANALYSIS_SYSTEM}

TRANSCRIPT:

${transcript}`
        }
      ];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: mode === "analysis" ? 1500 : 500,
        system: systemPrompt,
        messages: anthropicMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", data);

      return res.status(response.status).json({
        error: data?.error?.message || "Claude API request failed"
      });
    }

    const text = data?.content
      ?.filter(block => block.type === "text")
      ?.map(block => block.text)
      ?.join("") || "";

    if (mode === "analysis") {
      let parsed;

      try {
        parsed = JSON.parse(text);
      } catch {
        console.error("Invalid analysis JSON:", text);

        return res.status(500).json({
          error: "Claude returned invalid analysis JSON"
        });
      }

      return res.status(200).json(parsed);
    }

    return res.status(200).json({ text });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong on the server."
    });
  }
}
