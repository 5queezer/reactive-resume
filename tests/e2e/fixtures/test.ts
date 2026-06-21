import type { BrowserContext, Page } from "@playwright/test";
import type { E2EAccount } from "./data";
import { test as base, expect } from "@playwright/test";
import { createAuthenticatedContext } from "./auth";
import { createAccount } from "./data";
import { deleteE2EUser } from "./db";

type Fixtures = {
	account: E2EAccount;
	authContext: BrowserContext;
	authPage: Page;
};

export const test = base.extend<Fixtures>({
	account: async ({ baseURL }, use, testInfo) => {
		void baseURL;
		const account = createAccount(testInfo);

		try {
			await use(account);
		} finally {
			await deleteE2EUser(account);
		}
	},
	authContext: async ({ browser, request, account }, use, testInfo) => {
		const baseURL = String(testInfo.project.use.baseURL ?? "http://localhost:3000");
		const context = await createAuthenticatedContext(browser, request, account, baseURL);

		try {
			await use(context);
		} finally {
			await context.close();
		}
	},
	authPage: async ({ authContext }, use) => {
		const page = await authContext.newPage();

		try {
			await use(page);
		} finally {
			await page.close();
		}
	},
});

export { expect };
