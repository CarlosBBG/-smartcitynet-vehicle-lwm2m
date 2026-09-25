import { Paper, type PaperProps, styled } from '@mui/material';

const StyledCard = styled(Paper)({
  borderRadius: 16,
  overflow: 'hidden',
});

export function SectionCard(props: PaperProps) {
  return (
    <StyledCard
      elevation={0}
      variant="outlined"
      {...props}
    />
  );
}
