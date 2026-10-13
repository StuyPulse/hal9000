import React from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

/** System text size is honoured up to this multiple so layouts stay usable at the largest settings. */
export const MAX_FONT_SCALE = 1.35;

export const Text = React.forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
