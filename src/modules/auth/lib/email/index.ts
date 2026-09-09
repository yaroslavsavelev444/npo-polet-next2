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
	splitEmail,
	validateEmail,
	validateEmailFormat,
	validateEmailSecurity,
} from "./emailValidator";
