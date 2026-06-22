import 'dart:ui';
import 'package:flutter/material.dart';

class GlowingCard extends StatelessWidget {
  final Widget child;
  final List<Color>? borderGradients;
  final List<Color>? backgroundGradients;
  final double blur;
  final double borderRadius;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final Color glowColor;
  final double glowRadius;

  const GlowingCard({
    super.key,
    required this.child,
    this.borderGradients,
    this.backgroundGradients,
    this.blur = 15.0,
    this.borderRadius = 20.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 12.0, vertical: 16.0),
    this.margin = const EdgeInsets.symmetric(vertical: 10.0),
    this.glowColor = Colors.cyan,
    this.glowRadius = 0.0,
  });

  @override
  Widget build(BuildContext context) {
    final finalBgGradients = backgroundGradients ?? [
      const Color(0x1F111827), // Extremely transparent dark navy slate
      const Color(0x3B111827), 
    ];

    final finalBorderGradients = borderGradients ?? [
      Colors.white.withOpacity(0.12),
      Colors.white.withOpacity(0.04),
    ];

    return Container(
      margin: margin,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: glowRadius > 0.0
            ? [
                BoxShadow(
                  color: glowColor.withOpacity(0.15),
                  blurRadius: glowRadius,
                  spreadRadius: glowRadius * 0.2,
                )
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(borderRadius),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: finalBgGradients,
              ),
              border: Border.all(
                width: 1.5,
                color: Colors.transparent, // Required to use gradient border
              ),
            ),
            child: CustomPaint(
              painter: _GradientBorderPainter(
                borderRadius: borderRadius,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: finalBorderGradients,
                ),
                strokeWidth: 1.5,
              ),
              child: Padding(
                padding: const EdgeInsets.all(1.5), // Offset the border paint
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GradientBorderPainter extends CustomPainter {
  final double borderRadius;
  final Gradient gradient;
  final double strokeWidth;

  _GradientBorderPainter({
    required this.borderRadius,
    required this.gradient,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final Rect rect = Offset.zero & size;
    final Paint paint = Paint()
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..shader = gradient.createShader(rect);

    final RRect rrect = RRect.fromRectAndRadius(
      rect,
      Radius.circular(borderRadius),
    );

    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
