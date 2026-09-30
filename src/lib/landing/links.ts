import { SAMPLE_COURSE_ID } from "@/lib/sample-course";

/**
 * Where the landing page's calls to action lead. One file, so the route names
 * chosen by the game screens (src/app/(app)/play/**) can be retargeted in one
 * place without touching the page.
 */

/** "Start the sample run": the run map for the built-in sample course. */
export const SAMPLE_RUN_HREF = `/play?subjectId=${SAMPLE_COURSE_ID}`;

/** "Upload your notes": the screen where notes are dropped and a run is built. */
export const UPLOAD_HREF = "/subjects";
