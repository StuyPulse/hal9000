import React from 'react';
import { Text as RNText, TextInput as RNTextInput, useWindowDimensions, type TextInputProps, type TextProps } from 'react-native';

/** Preserve Dynamic Type, including accessibility sizes; individual display art may opt out. */
export const MAX_FONT_SCALE = 0;

export const Text = React.forwardRef<RNText, TextProps>(function Text(props, ref) {
  const {fontScale}=useWindowDimensions();
  // Re-measure native text when the system size changes while this screen is open.
  return <RNText key={fontScale} ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
