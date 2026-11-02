export const humorStyles = [
  { id: "relatable", name: "Too relatable", instruction: "Use recognizable everyday frustrations and observations that feel personally relatable." },
  { id: "deadpan", name: "Dry & deadpan", instruction: "Use understated, matter-of-fact humor with a dry delivery. Avoid exaggerated reactions." },
  { id: "absurd", name: "Absolutely absurd", instruction: "Use unexpected, surreal exaggeration and playful absurdity grounded in the photo and scene." },
] as const;

export type HumorStyle = typeof humorStyles[number]["id"];

/** Remove only the known context suffix written by the tool, preserving user text. */
export function originalScene(scene: string): string {
  for (const style of humorStyles) {
    const suffix = `\n\nSelected humor style: ${style.name}. ${style.instruction}`;
    if (scene.endsWith(suffix)) return scene.slice(0, -suffix.length);
  }
  return scene;
}
