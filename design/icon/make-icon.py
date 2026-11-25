"""
Draws the QuizWalk app icon: a map pin holding a question mark at the end of a dotted trail,
on the brand green. Writes the SVGs next to this file; render them with rsvg-convert:

    python3 design/icon/make-icon.py && sh design/icon/render.sh
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GREEN = "#1F6F4A"
WHITE = "#FFFFFF"


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


# The trail: an easy S-curve from the start ring to the pin's tip, dots evenly spaced.
P = [(205, 865), (330, 690), (470, 905), (585, 772)]
pts = [bez(*P, i / 400) for i in range(401)]
lengths = [0.0]
for a, b in zip(pts, pts[1:]):
    lengths.append(lengths[-1] + math.dist(a, b))
STEP = 62
dots = []
d = STEP * 1.25
j = 0
while d < lengths[-1] - 30:
    while lengths[j + 1] < d:
        j += 1
    f = (d - lengths[j]) / (lengths[j + 1] - lengths[j])
    dots.append((pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])))
    d += STEP


def art(fg, accent, start_fill, shadow=True):
    out = []
    if shadow:
        out.append('<ellipse cx="600" cy="772" rx="78" ry="18" fill="#000" opacity="0.16"/>')
    for x, y in dots:
        out.append('<circle cx="%.1f" cy="%.1f" r="17" fill="%s"/>' % (x, y, fg))
    out.append(
        '<circle cx="%d" cy="%d" r="40" fill="%s" stroke="%s" stroke-width="16"/>'
        % (P[0][0], P[0][1], start_fill, fg)
    )
    out.append(
        '<path d="M600 772 C 540 690, 372 586, 372 430 A 228 228 0 1 1 828 430 '
        'C 828 586, 660 690, 600 772 Z" fill="%s"/>' % fg
    )
    out.append(
        '<path d="M520 368 C 520 304, 566 268, 612 268 C 666 268, 700 306, 700 352 '
        'C 700 404, 650 420, 624 446 C 608 462, 604 474, 604 506" fill="none" stroke="%s" '
        'stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>' % accent
    )
    out.append('<circle cx="604" cy="590" r="36" fill="%s"/>' % accent)
    return "\n  ".join(out)


GRADIENT = (
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#2C8C5F"/><stop offset="1" stop-color="#14502F"/>'
    "</linearGradient></defs>"
)
STREETS = (
    '<g stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="34" fill="none" stroke-linecap="round">'
    '<path d="M-40 300 L1064 210"/><path d="M-40 640 L1064 590"/>'
    '<path d="M180 -40 L260 1064"/><path d="M800 -40 L900 1064"/></g>'
    '<g stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="16" fill="none">'
    '<path d="M-40 470 L1064 420"/><path d="M480 -40 L540 1064"/></g>'
)


def svg(body, background):
    bg = GRADIENT + '<rect width="1024" height="1024" fill="url(#g)"/>' + STREETS if background else ""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        + bg
        + body
        + "</svg>"
    )


def write(name, content):
    with open(os.path.join(HERE, name), "w") as f:
        f.write(content)


CENTRE = "translate(-40,-20)"
# Android keeps the foreground inside the middle 66% of the canvas.
SAFE = "translate(512,512) scale(0.62) translate(-512,-512) " + CENTRE

write("icon.svg", svg('<g transform="%s">%s</g>' % (CENTRE, art(WHITE, GREEN, GREEN)), True))
write("android-background.svg", svg("", True))
write("android-foreground.svg", svg('<g transform="%s">%s</g>' % (SAFE, art(WHITE, GREEN, GREEN)), False))
write(
    "android-monochrome.svg",
    svg('<g transform="%s">%s</g>' % (SAFE, art(WHITE, "#000000", "#000000", shadow=False)), False),
)
write("splash.svg", svg('<g transform="%s">%s</g>' % (CENTRE, art(GREEN, WHITE, WHITE)), False))
