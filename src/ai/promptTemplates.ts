/**
 * Prompt templates for AI profile generation.
 * All prompts are structured to produce consistent, parseable JSON output.
 */

export interface AnalysisContext {
  login: string;
  name: string | null;
  techStacks: Array<{ name: string; confidence: number; evidence: string[] }>;
  architectureTags: string[];
  seniorityScore: number;
  consistencyScore: number;
  commitQuality: number;
  repoCount: number;
  topLanguages: string[];
}

/**
 * Builds the main profile generation prompt.
 * Instructs Claude to return structured JSON with bio, tech summary,
 * strength areas, and a full GitHub profile README.
 */
export function buildProfilePrompt(ctx: AnalysisContext): string {
  const seniorityLabel =
    ctx.seniorityScore >= 0.8
      ? 'senior/principal'
      : ctx.seniorityScore >= 0.6
      ? 'mid-senior'
      : ctx.seniorityScore >= 0.4
      ? 'mid-level'
      : 'junior';

  const topStacks = ctx.techStacks
    .slice(0, 5)
    .map((s) => `${s.name} (confidence: ${Math.round(s.confidence * 100)}%, evidence: ${s.evidence.slice(0, 2).join(', ')})`)
    .join('\n');

  return `You are generating a professional developer profile based on GitHub activity analysis.

## Developer Context

GitHub login: ${ctx.login}
Display name: ${ctx.name ?? ctx.login}
Repository count: ${ctx.repoCount}
Seniority estimate: ${seniorityLabel} (score: ${ctx.seniorityScore.toFixed(2)}/1.00)
Consistency score: ${ctx.consistencyScore.toFixed(2)}/1.00 (contribution frequency)
Commit quality: ${ctx.commitQuality.toFixed(2)}/1.00

## Detected Tech Stacks (by evidence strength)
${topStacks || 'No stacks detected'}

## Top Languages
${ctx.topLanguages.slice(0, 6).join(', ') || 'None detected'}

## Architecture Patterns Detected
${ctx.architectureTags.length > 0 ? ctx.architectureTags.join(', ') : 'None detected'}

## Instructions

Generate a developer profile in the following JSON format. Do not include any text outside the JSON object.

{
  "bio": "<3-4 paragraph professional bio in third person (no first-person pronouns). Describe the developer's specialisation, typical projects, and working style based on the evidence above.>",
  "techSummary": "<2-3 paragraph technical summary ranked by evidence strength. Be specific about frameworks, patterns, and architecture styles the data supports.>",
  "strengthAreas": [
    "<strength 1>",
    "<strength 2>",
    "<strength 3>",
    "<strength 4>",
    "<strength 5>"
  ],
  "readmeMarkdown": "<A complete, well-formatted GitHub profile README in markdown. Include: About section, tech stack table, architecture patterns, consistency badge-style stats, and a suggested headline. Use real markdown with headers, tables, and bullet points. Make it professional and specific to the detected data.>"
}

Base everything strictly on the data provided. Do not invent languages or frameworks not evidenced. Do not use generic filler phrases.`;
}
