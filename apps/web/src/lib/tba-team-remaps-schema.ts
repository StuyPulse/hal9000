import { z } from "zod";

export const tbaTeamRemapsSchema = z.record(z.string().regex(/^frc\d+$/), z.string().regex(/^frc\d+[A-Za-z]*$/));
