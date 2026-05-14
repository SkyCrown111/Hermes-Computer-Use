#!/usr/bin/env python3
"""Generate Hermes Console app icon in all required sizes."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

# Output directory
ICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(ICONS_DIR, exist_ok=True)

# Color palette (from app globals.css)
PRIMARY = (143, 72, 47)        # #8F482F
PRIMARY_LIGHT = (173, 95, 69)  # #AD5F45
WHITE = (255, 255, 255)
WARM_WHITE = (250, 249, 245)   # #FAF9F5
WING_ACCENT = (255, 219, 208)  # #FFDBD0 (primary-fixed)

def draw_rounded_rect(draw, xy, radius, fill):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2*radius, y0 + 2*radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2*radius, y0, x1, y0 + 2*radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2*radius, x0 + 2*radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2*radius, y1 - 2*radius, x1, y1], 0, 90, fill=fill)

def create_gradient(size, color1, color2, angle=135):
    """Create a gradient image."""
    img = Image.new('RGBA', (size, size))
    for y in range(size):
        for x in range(size):
            # Diagonal gradient
            t = (x + y) / (2 * size)
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            img.putpixel((x, y), (r, g, b, 255))
    return img

def draw_hermes_icon(size):
    """Draw the Hermes Console app icon."""
    # Create base with gradient
    img = create_gradient(size, PRIMARY, PRIMARY_LIGHT)
    draw = ImageDraw.Draw(img)
    
    # Draw rounded rectangle background
    corner_radius = size // 5
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    draw_rounded_rect(mask_draw, (0, 0, size-1, size-1), corner_radius, 255)
    
    # Apply mask
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg.paste(img, mask=mask)
    img = bg
    draw = ImageDraw.Draw(img)
    
    # Icon dimensions
    cx, cy = size // 2, size // 2
    scale = size / 1024  # Base scale on 1024px
    
    # === Draw stylized "H" with wings ===
    
    # H letter - two vertical bars and crossbar
    h_width = int(120 * scale)
    h_height = int(380 * scale)
    h_gap = int(100 * scale)  # Gap between vertical bars
    bar_radius = int(30 * scale)  # Rounded ends
    
    left_x = cx - h_gap - h_width
    right_x = cx + h_gap
    top_y = cy - h_height // 2
    bottom_y = cy + h_height // 2
    
    # Draw H vertical bars with rounded ends
    # Left bar
    draw_rounded_rect(draw, 
        (left_x, top_y, left_x + h_width, bottom_y),
        bar_radius, WHITE)
    # Right bar
    draw_rounded_rect(draw,
        (right_x, top_y, right_x + h_width, bottom_y),
        bar_radius, WHITE)
    # Crossbar
    crossbar_h = int(80 * scale)
    crossbar_y = cy - crossbar_h // 2
    draw.rectangle([left_x + h_width, crossbar_y, right_x, crossbar_y + crossbar_h], fill=WHITE)
    
    # === Draw wings (stylized, geometric) ===
    wing_color = WING_ACCENT  # Lighter accent color for wings
    
    # Right wing - upward swoosh
    wing_points_right = []
    wing_base_x = cx + h_gap + h_width + int(20 * scale)
    wing_base_y = cy - int(60 * scale)
    
    # Main wing feather (right)
    wing_points_right = [
        (wing_base_x, wing_base_y + int(40 * scale)),  # base
        (wing_base_x + int(80 * scale), wing_base_y - int(80 * scale)),  # tip 1
        (wing_base_x + int(120 * scale), wing_base_y - int(60 * scale)),  # outer 1
        (wing_base_x + int(160 * scale), wing_base_y - int(140 * scale)),  # tip 2
        (wing_base_x + int(180 * scale), wing_base_y - int(100 * scale)),  # outer 2
        (wing_base_x + int(200 * scale), wing_base_y - int(160 * scale)),  # tip 3 (top)
        (wing_base_x + int(140 * scale), wing_base_y - int(60 * scale)),  # inner
        (wing_base_x + int(80 * scale), wing_base_y + int(20 * scale)),  # back
    ]
    draw.polygon(wing_points_right, fill=wing_color)
    
    # Left wing - mirror (upward swoosh going left)
    wing_base_x_left = cx - h_gap - h_width - int(20 * scale)
    wing_points_left = [
        (wing_base_x_left, wing_base_y + int(40 * scale)),  # base
        (wing_base_x_left - int(80 * scale), wing_base_y - int(80 * scale)),  # tip 1
        (wing_base_x_left - int(120 * scale), wing_base_y - int(60 * scale)),  # outer 1
        (wing_base_x_left - int(160 * scale), wing_base_y - int(140 * scale)),  # tip 2
        (wing_base_x_left - int(180 * scale), wing_base_y - int(100 * scale)),  # outer 2
        (wing_base_x_left - int(200 * scale), wing_base_y - int(160 * scale)),  # tip 3 (top)
        (wing_base_x_left - int(140 * scale), wing_base_y - int(60 * scale)),  # inner
        (wing_base_x_left - int(80 * scale), wing_base_y + int(20 * scale)),  # back
    ]
    draw.polygon(wing_points_left, fill=wing_color)
    
    # Add small dot accents (AI/tech feel)
    dot_y = cy + h_height // 2 + int(60 * scale)
    dot_r = int(12 * scale)
    draw.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r], fill=WHITE)
    
    # Small dots flanking
    small_r = int(6 * scale)
    draw.ellipse([cx - int(40*scale) - small_r, dot_y - small_r, 
                  cx - int(40*scale) + small_r, dot_y + small_r], fill=WING_ACCENT)
    draw.ellipse([cx + int(40*scale) - small_r, dot_y - small_r,
                  cx + int(40*scale) + small_r, dot_y + small_r], fill=WING_ACCENT)
    
    return img

def generate_all_sizes():
    """Generate all required icon sizes."""
    sizes = {
        'icon.png': 1024,
        'icon.ico': 256,  # Will create multi-size .ico
        '32x32.png': 32,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }
    
    # Generate base icon at highest resolution
    print("Generating base icon at 1024x1024...")
    base_icon = draw_hermes_icon(1024)
    
    for filename, target_size in sizes.items():
        filepath = os.path.join(ICONS_DIR, filename)
        if filename == 'icon.ico':
            # Create multi-size .ico
            ico_sizes = [16, 32, 48, 64, 128, 256]
            ico_images = [base_icon.resize((s, s), Image.LANCZOS) for s in ico_sizes]
            ico_images[0].save(filepath, format='ICO', sizes=[(s, s) for s in ico_sizes],
                             append_images=ico_images[1:])
            print(f"  {filename} (multi-size ICO)")
        elif filename == 'icon.icns':
            # Skip .icns for now (macOS only)
            continue
        else:
            resized = base_icon.resize((target_size, target_size), Image.LANCZOS)
            resized.save(filepath, 'PNG')
            print(f"  {filename} ({target_size}x{target_size})")
    
    # Also save a preview
    preview_path = os.path.join(ICONS_DIR, '..', 'icon_preview.png')
    base_icon.resize((512, 512), Image.LANCZOS).save(preview_path, 'PNG')
    print(f"\nPreview saved to: {os.path.abspath(preview_path)}")
    print(f"All icons generated in: {os.path.abspath(ICONS_DIR)}")

if __name__ == '__main__':
    generate_all_sizes()
