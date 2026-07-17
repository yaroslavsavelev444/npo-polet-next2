export {
	ALLOWED_EMAIL_DOMAINS,
	isAllowedEmailDomain,
} from "./allowedEmailDomains";
export {
	DISPOSABLE_EMAIL_DOMAINS,
	isDisposableEmailDomain,
	isReservedPlaceholderDomain,
	RESERVED_PLACEHOLDER_DOMAINS,
} from "./blockedEmailDomains";
export {
	EMAIL_FORMAT_REGEX,
	hasSuspiciousLocalPart,
	SUSPICIOUS_LOCAL_PART_PATTERNS,
} from "./emailPatterns";
export {
	EMAIL_ERROR_MESSAGES,
	type EmailParts,
	isSupportedEmailDomain,
	splitEmail,
	validateEmail,
	validateEmailFormat,
	validateEmailSecurity,
} from "./emailValidator";
