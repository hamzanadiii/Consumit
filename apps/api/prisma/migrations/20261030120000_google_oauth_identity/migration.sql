ALTER TABLE "Member" ADD COLUMN "googleSubject" VARCHAR(255);

CREATE UNIQUE INDEX "Member_googleSubject_key" ON "Member"("googleSubject");
