/**
 * @param {import('probot').Probot} app
 */
import { Probot } from 'probot';

module.exports = (app: Probot) => {
  app.log("Yay! The app was loaded!");

  app.on("issues.opened", async (context) => {
    return context.octokit.issues.createComment(
      context.issue({ body: "Hello, World!" })
    );
  });
};

