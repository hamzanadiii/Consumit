-- Ordered favorites grow from four slots to six.
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_position_check";
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_position_check" CHECK ("position" BETWEEN 1 AND 6);
