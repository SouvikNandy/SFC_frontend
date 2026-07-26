# COMPONENT_MAP.md

The approved HTML must be broken into Angular components.

Example

approved-design.html

↓

Public Layout

├── HeaderComponent
├── HeroComponent
├── AboutPreviewComponent
├── ServicesComponent
├── StatisticsComponent
├── WhyChooseUsComponent
├── FeatureCardsComponent
├── TestimonialComponent
├── FAQComponent
├── CTAComponent
├── FooterComponent

Each section should become a reusable standalone component.

Never create a single HomeComponent containing thousands of lines.

Large repeated cards should become shared components.

Examples

Service Card

Blog Card

Statistic Card

Feature Card

Testimonial Card

FAQ Item

Button

Input

Section Title

Container