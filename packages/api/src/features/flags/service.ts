import { env } from "@reactive-resume/env/server";

export type FeatureFlags = {
	disableSignups: boolean;
	disableEmailAuth: boolean;
	showSponsors: boolean;
};

export const flagsService = {
	getFlags: (): FeatureFlags => ({
		disableSignups: env.FLAG_DISABLE_SIGNUPS,
		disableEmailAuth: env.FLAG_DISABLE_EMAIL_AUTH,
		showSponsors: env.FLAG_SHOW_SPONSORS,
	}),
};
