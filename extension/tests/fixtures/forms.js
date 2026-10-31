'use strict';

// HTML fixtures for kpxcFormClassifier. Values are static and never inspected by the classifier.
module.exports = [
    {
        name: 'login-basic-username-password',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="username" autocomplete="username">
            <input type="password" name="password" autocomplete="current-password">
            <button type="submit">Sign in</button>
        </form>`
    },
    {
        name: 'login-email-password',
        expected: 'login',
        url: 'https://example.com/account',
        html: `<form>
            <input type="email" name="email" autocomplete="username">
            <input type="password" name="password">
            <button type="submit">Log in</button>
        </form>`
    },
    {
        name: 'login-german-submit',
        expected: 'login',
        url: 'https://example.de/anmelden',
        html: `<form>
            <input type="text" name="benutzer">
            <input type="password" name="passwort">
            <button type="submit">Anmelden</button>
        </form>`
    },
    {
        name: 'login-arabic-submit',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <button type="submit">تسجيل الدخول</button>
        </form>`
    },
    {
        name: 'login-generic-continue',
        expected: 'login',
        url: 'https://example.com/',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'login-forgot-link-text',
        expected: 'login',
        url: 'https://example.com/login',
        pageText: 'Welcome. Forgot your password? Reset it here.',
        html: `<form>
            <input type="text" name="login">
            <input type="password" name="pass">
            <button type="submit">Sign in</button>
        </form>`
    },
    {
        name: 'login-remember-me',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="user">
            <input type="password" name="pass">
            <label><input type="checkbox" name="remember"> Remember me</label>
            <button type="submit">Login</button>
        </form>`
    },
    {
        name: 'login-autocomplete-current-password',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="user" autocomplete="username">
            <input type="password" name="pass" autocomplete="current-password">
            <button type="submit">Sign in</button>
        </form>`
    },
    {
        name: 'login-hidden-honeypot-password',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="user">
            <input type="password" name="decoy" style="display: none">
            <input type="password" name="password">
            <button type="submit">Sign in</button>
        </form>`
    },
    {
        name: 'login-password-only',
        expected: 'login',
        url: 'https://example.com/lock',
        html: `<form>
            <input type="password" name="password" autocomplete="current-password">
            <button type="submit">Unlock</button>
        </form>`
    },
    {
        name: 'login-with-otp-field',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="user">
            <input type="password" name="password" autocomplete="current-password">
            <input type="text" name="otp" autocomplete="one-time-code">
            <button type="submit">Sign in</button>
        </form>`
    },
    {
        name: 'login-session-url',
        expected: 'login',
        url: 'https://example.com/session/new',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'login-aria-label-submit',
        expected: 'login',
        url: 'https://example.com/login',
        html: `<form>
            <input type="text" name="user">
            <input type="password" name="pass">
            <button type="submit" aria-label="Sign in"><span aria-hidden="true">→</span></button>
        </form>`
    },
    {
        name: 'login-welcome-back-text',
        expected: 'login',
        url: 'https://example.com/login',
        pageText: 'Welcome back. Please enter your details.',
        html: `<form>
            <input type="text" name="user">
            <input type="password" name="pass">
            <button type="submit">Continue</button>
        </form>`
    },

    {
        name: 'register-email-password-confirm',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <button type="submit">Create account</button>
        </form>`
    },
    {
        name: 'register-new-password-autocomplete',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email" autocomplete="username">
            <input type="password" name="password" autocomplete="new-password">
            <input type="password" name="password_repeat" autocomplete="new-password">
            <button type="submit">Sign up</button>
        </form>`
    },
    {
        name: 'register-signup-url-single-password',
        expected: 'register',
        url: 'https://example.com/signup',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <button type="submit">Register</button>
        </form>`
    },
    {
        name: 'register-extra-fields-terms',
        expected: 'register',
        url: 'https://example.com/join',
        html: `<form>
            <input type="text" name="first_name">
            <input type="text" name="last_name">
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="password_confirm">
            <label><input type="checkbox" name="terms"> I agree to the terms</label>
            <button type="submit">Join now</button>
        </form>`
    },
    {
        name: 'register-two-passwords-no-confirm-label',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password_one">
            <input type="password" name="password_two">
            <button type="submit">Create account</button>
        </form>`
    },
    {
        name: 'register-single-new-password',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password" autocomplete="new-password">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'register-url-single-password',
        expected: 'register',
        url: 'https://example.com/register',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'register-german',
        expected: 'register',
        url: 'https://example.de/registrieren',
        html: `<form>
            <input type="text" name="vorname">
            <input type="email" name="email">
            <input type="password" name="passwort">
            <input type="password" name="passwort_wiederholen">
            <button type="submit">Konto erstellen</button>
        </form>`
    },
    {
        name: 'register-french',
        expected: 'register',
        url: 'https://example.fr/inscription',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="mot_de_passe">
            <input type="password" name="confirmer_mot_de_passe">
            <button type="submit">S'inscrire</button>
        </form>`
    },
    {
        name: 'register-spanish',
        expected: 'register',
        url: 'https://example.es/registro',
        html: `<form>
            <input type="email" name="correo">
            <input type="password" name="contrasena">
            <input type="password" name="repetir_contrasena">
            <button type="submit">Crear cuenta</button>
        </form>`
    },
    {
        name: 'register-arabic',
        expected: 'register',
        url: 'https://example.com/register',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <button type="submit">إنشاء حساب</button>
        </form>`
    },
    {
        name: 'register-login-page-text-nearby',
        expected: 'register',
        url: 'https://example.com/start',
        pageText: 'Already have an account? Sign in instead.',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <button type="submit">Create account</button>
        </form>`
    },
    {
        name: 'register-password-rules',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password" autocomplete="new-password"
                passwordrules="minlength: 12; required: lower; required: upper; required: digit;"
                minlength="12" pattern=".{12,}">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'register-phone-and-name',
        expected: 'register',
        url: 'https://example.com/create',
        html: `<form>
            <input type="text" name="first_name">
            <input type="tel" name="phone">
            <input type="password" name="password">
            <input type="password" name="password_confirmation">
            <button type="submit">Next</button>
        </form>`
    },
    {
        name: 'register-terms-only-hint',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <label><input type="checkbox" name="agree_tos"> I accept the terms of service</label>
            <button type="submit">Go</button>
        </form>`
    },
    {
        name: 'register-confirm-label-get-started',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="repeat_password">
            <button type="submit">Get started</button>
        </form>`
    },
    {
        name: 'register-named-new-password',
        expected: 'register',
        url: 'https://example.com/account',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="new_password" aria-label="New password">
            <button type="submit">Save</button>
        </form>`
    },
    {
        name: 'register-create-account-url',
        expected: 'register',
        url: 'https://example.com/create-account',
        html: `<form>
            <input type="email" name="email">
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <button type="submit">Continue</button>
        </form>`
    },
    {
        name: 'register-username-confirm-terms',
        expected: 'register',
        url: 'https://example.com/start',
        html: `<form>
            <input type="text" name="username">
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <label><input type="checkbox" name="terms"> Terms</label>
            <button type="submit">Create Account</button>
        </form>`
    },

    {
        name: 'change-current-new-confirm',
        expected: 'change-password',
        url: 'https://example.com/account/security',
        html: `<form>
            <input type="password" name="current_password" autocomplete="current-password">
            <input type="password" name="new_password" autocomplete="new-password">
            <input type="password" name="confirm_password" autocomplete="new-password">
            <button type="submit">Update password</button>
        </form>`
    },
    {
        name: 'change-old-new-labeled',
        expected: 'change-password',
        url: 'https://example.com/settings',
        html: `<form>
            <input type="password" name="old_password" aria-label="Old password">
            <input type="password" name="new_password" aria-label="New password">
            <button type="submit">Change password</button>
        </form>`
    },
    {
        name: 'change-password-url-autocomplete',
        expected: 'change-password',
        url: 'https://example.com/account/password',
        html: `<form>
            <input type="password" name="password" autocomplete="current-password">
            <input type="password" name="new_password" autocomplete="new-password">
            <button type="submit">Save</button>
        </form>`
    },
    {
        name: 'change-three-passwords-settings-url',
        expected: 'change-password',
        url: 'https://example.com/settings/password',
        html: `<form>
            <input type="password" name="current_password">
            <input type="password" name="new_password">
            <input type="password" name="confirm_new_password">
            <button type="submit">Save</button>
        </form>`
    },

    {
        name: 'reset-two-passwords',
        expected: 'reset-password',
        url: 'https://example.com/reset-password',
        html: `<form>
            <input type="password" name="password">
            <input type="password" name="confirm_password">
            <button type="submit">Reset password</button>
        </form>`
    },
    {
        name: 'reset-new-password-forgot-url',
        expected: 'reset-password',
        url: 'https://example.com/forgot',
        html: `<form>
            <input type="password" name="new_password" autocomplete="new-password">
            <button type="submit">Set new password</button>
        </form>`
    },
    {
        name: 'reset-request-email-only',
        expected: 'reset-password',
        url: 'https://example.com/reset',
        html: `<form>
            <input type="email" name="email">
            <button type="submit">Send reset link</button>
        </form>`
    },
    {
        name: 'reset-recover-new-confirm',
        expected: 'reset-password',
        url: 'https://example.com/recover',
        html: `<form>
            <input type="password" name="password" autocomplete="new-password">
            <input type="password" name="password_confirmation">
            <button type="submit">Reset</button>
        </form>`
    },

    {
        name: 'otp-segmented-six',
        expected: 'otp',
        url: 'https://example.com/verify',
        html: `<form>
            <input type="text" name="code1" autocomplete="one-time-code" maxlength="1">
            <input type="text" name="code2" autocomplete="one-time-code" maxlength="1">
            <input type="text" name="code3" autocomplete="one-time-code" maxlength="1">
            <input type="text" name="code4" autocomplete="one-time-code" maxlength="1">
            <input type="text" name="code5" autocomplete="one-time-code" maxlength="1">
            <input type="text" name="code6" autocomplete="one-time-code" maxlength="1">
        </form>`
    },
    {
        name: 'otp-single-autocomplete',
        expected: 'otp',
        url: 'https://example.com/verify',
        html: `<form>
            <input type="text" name="otp" autocomplete="one-time-code">
            <button type="submit">Verify</button>
        </form>`
    },
    {
        name: 'otp-segmented-four',
        expected: 'otp',
        url: 'https://example.com/verify',
        html: `<form>
            <input type="text" name="digit1" autocomplete="one-time-code">
            <input type="text" name="digit2" autocomplete="one-time-code">
            <input type="text" name="digit3" autocomplete="one-time-code">
            <input type="text" name="digit4" autocomplete="one-time-code">
        </form>`
    },

    {
        name: 'unknown-search-form',
        expected: 'unknown',
        url: 'https://example.com/',
        html: `<form>
            <input type="search" name="q" placeholder="Search">
            <button type="submit">Search</button>
        </form>`
    },
    {
        name: 'unknown-newsletter',
        expected: 'unknown',
        url: 'https://example.com/blog',
        html: `<form>
            <input type="email" name="email" placeholder="Your email">
            <button type="submit">Subscribe</button>
        </form>`
    },
    {
        name: 'unknown-contact-form',
        expected: 'unknown',
        url: 'https://example.com/contact',
        html: `<form>
            <input type="text" name="full_name">
            <input type="email" name="email">
            <textarea name="message"></textarea>
            <button type="submit">Send</button>
        </form>`
    },
    {
        name: 'unknown-quantity-form',
        expected: 'unknown',
        url: 'https://example.com/product',
        html: `<form>
            <input type="number" name="quantity" value="1">
            <button type="submit">Add to cart</button>
        </form>`
    },
    {
        name: 'unknown-coupon-form',
        expected: 'unknown',
        url: 'https://example.com/cart',
        html: `<form>
            <input type="text" name="coupon" placeholder="Coupon code">
            <button type="submit">Apply</button>
        </form>`
    }
];
