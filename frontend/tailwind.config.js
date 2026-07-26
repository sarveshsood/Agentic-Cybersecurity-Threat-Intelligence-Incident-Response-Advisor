/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
                heading: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
                mono: ["IBM Plex Mono", "Cascadia Code", "ui-monospace", "monospace"],
            },
            fontSize: {
                display: ["2.25rem", {lineHeight: "2.5rem", fontWeight: "700"}],
                heading: ["1.875rem", {lineHeight: "2.25rem", fontWeight: "600"}],
                h1: ["1.5rem", {lineHeight: "2rem", fontWeight: "600"}],
                h2: ["1.25rem", {lineHeight: "1.75rem", fontWeight: "600"}],
                h3: ["1.125rem", {lineHeight: "1.75rem", fontWeight: "600"}],
                body: ["1rem", {lineHeight: "1.5rem", fontWeight: "500"}],
                small: ["0.875rem", {lineHeight: "1.25rem", fontWeight: "500"}],
                caption: ["0.75rem", {lineHeight: "1rem", fontWeight: "500"}],
            },
            spacing: {
                // 8-point grid aliases (4 already exists as 1)
                4.5: "1.125rem",
                13: "3.25rem",
                15: "3.75rem",
                18: "4.5rem",
            },
            borderRadius: {
                lg: "var(--radius)", /* 8px */
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                card: "0.75rem", /* 12px */
                dialog: "0.75rem",
            },
            boxShadow: {
                sm: "var(--shadow-sm)",
                DEFAULT: "var(--shadow-md)",
                md: "var(--shadow-md)",
                lg: "var(--shadow-lg)",
                none: "none",
            },
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                brand: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                success: {
                    DEFAULT: "var(--success)",
                    foreground: "#fff",
                },
                warning: {
                    DEFAULT: "var(--warning)",
                    foreground: "#fff",
                },
                info: {
                    DEFAULT: "var(--info)",
                    foreground: "#fff",
                },
                navy: "#0F172A",
                chart: {
                    1: "hsl(var(--chart-1))",
                    2: "hsl(var(--chart-2))",
                    3: "hsl(var(--chart-3))",
                    4: "hsl(var(--chart-4))",
                    5: "hsl(var(--chart-5))",
                },
            },
            keyframes: {
                "accordion-down": {
                    from: {height: "0"},
                    to: {height: "var(--radix-accordion-content-height)"},
                },
                "accordion-up": {
                    from: {height: "var(--radix-accordion-content-height)"},
                    to: {height: "0"},
                },
                "fade-in": {
                    from: {opacity: "0"},
                    to: {opacity: "1"},
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "fade-in": "fade-in 0.15s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
