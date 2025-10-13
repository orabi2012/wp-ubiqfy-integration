export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.trim().length === 0) {
        throw new Error(
            'JWT_SECRET environment variable is not set. Please define a strong secret before starting the application.',
        );
    }

    return secret;
}
