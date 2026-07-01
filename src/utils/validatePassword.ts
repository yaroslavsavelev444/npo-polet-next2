/**
 * Validates a password against the project rules:
 *   – 8–16 characters
 *   – at least one uppercase letter
 *   – at least one lowercase letter
 *   – at least one digit
 *   – at least one special character
 *
 * Returns an error message string or null when the password is valid.
 */
export function validatePassword(password: string): string | null {
  if (!password) return "Введите пароль";
  if (password.length < 8) return "Пароль должен содержать не менее 8 символов";
  if (password.length > 16) return "Пароль должен содержать не более 16 символов";
  if (!/[A-Z]/.test(password)) return "Пароль должен содержать заглавную букву";
  if (!/[a-z]/.test(password)) return "Пароль должен содержать строчную букву";
  if (!/\d/.test(password)) return "Пароль должен содержать цифру";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password))
    return "Пароль должен содержать специальный символ";
  return null;
}