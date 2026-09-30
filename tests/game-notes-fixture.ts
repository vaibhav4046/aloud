import type { Subject } from "@/lib/courses/types";
import { buildSubject } from "@/lib/intake/build";

/**
 * Notes a learner might paste, long enough for the real intake to build a
 * subject with concepts, exam questions and passages. The subject comes out of
 * `buildSubject`, the same code path as an upload, so a test over it is a test
 * over the shape a real uploaded subject has (origin "paste", not a starter).
 */
export const NOTES = [
  "Photosynthesis converts light energy into chemical energy stored as glucose. It happens inside chloroplasts, which are found in the cells of leaves.",
  "The light-dependent reactions happen in the thylakoid membrane and split water, releasing oxygen as a by-product. They produce ATP and NADPH for the next stage.",
  "The Calvin cycle runs in the stroma and fixes carbon dioxide using ATP and NADPH from the light reactions. It builds three-carbon sugars that become glucose.",
  "Chlorophyll absorbs red and blue light most strongly, which is why leaves look green to us. It reflects green light rather than using it.",
  "Rubisco is the enzyme that fixes carbon dioxide in the Calvin cycle, and it is the most abundant protein on the planet. It works slowly, so leaves hold a lot of it.",
  "Stomata are pores on the underside of a leaf that let carbon dioxide in and water vapour out. Guard cells open the stomata when there is plenty of water.",
  "Chloroplasts contain stacks of thylakoids called grana, and the fluid around them is the stroma. The grana hold the chlorophyll that catches light.",
  "Photorespiration wastes energy when rubisco binds oxygen instead of carbon dioxide. Hot dry days make it worse because the stomata close to save water.",
  "Glucose made by photosynthesis is used for respiration or stored as starch. Plants also turn some of it into cellulose for cell walls.",
  "Light intensity, carbon dioxide concentration and temperature are the three limiting factors of photosynthesis. The scarcest factor sets the rate.",
].join("\n\n");

export async function notesSubject(ownerId: string): Promise<Subject> {
  const r = await buildSubject({ kind: "paste", title: "Photosynthesis notes", text: NOTES }, ownerId);
  if (!r.ok) throw new Error(`fixture notes did not build a subject: ${r.error.code}`);
  return r.subject;
}
