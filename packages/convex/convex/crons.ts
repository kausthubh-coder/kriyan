import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("empty the trash", "0 4 * * *", internal.maintenance.emptyTrash, {});

export default crons;
