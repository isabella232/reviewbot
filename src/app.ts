/**
 * @param {import('probot').Probot} app
 */
import { Probot } from 'probot';

exports = (app: Probot) => {
  app.log("Yay! The app was loaded!");

  app.on("pull_request.opened", async (context) => {
    return context.octokit.pulls.createReview();
  });
};

