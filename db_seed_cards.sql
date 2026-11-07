-- ============================================================
--  Seed: стандартная колода 52 карты
--  Suit: H = Hearts, D = Diamonds, C = Clubs, S = Spades
--  Power: 2→2 … 10→10, J→11, Q→12, K→13, A→14
-- ============================================================

INSERT INTO `cards` (`name`, `suit`, `value`, `power`) VALUES
-- Hearts
('7 of Hearts',    'hearts',   '7',  7),
('Jack of Hearts', 'hearts',   'J',  11),
('3 of Hearts',    'hearts',   '3',  3),
('Queen of Hearts','hearts',   'Q',  12),
('9 of Hearts',    'hearts',   '9',  9),
('Ace of Hearts',  'hearts',   'A',  14),
('5 of Hearts',    'hearts',   '5',  5),
('King of Hearts', 'hearts',   'K',  13),
('2 of Hearts',    'hearts',   '2',  2),
('8 of Hearts',    'hearts',   '8',  8),
('10 of Hearts',   'hearts',   '10', 10),
('4 of Hearts',    'hearts',   '4',  4),
('6 of Hearts',    'hearts',   '6',  6),

-- Diamonds
('7 of Diamonds',    'diamonds', '7',  7),
('Jack of Diamonds', 'diamonds', 'J',  11),
('3 of Diamonds',    'diamonds', '3',  3),
('Queen of Diamonds','diamonds', 'Q',  12),
('9 of Diamonds',    'diamonds', '9',  9),
('Ace of Diamonds',  'diamonds', 'A',  14),
('5 of Diamonds',    'diamonds', '5',  5),
('King of Diamonds', 'diamonds', 'K',  13),
('2 of Diamonds',    'diamonds', '2',  2),
('8 of Diamonds',    'diamonds', '8',  8),
('10 of Diamonds',   'diamonds', '10', 10),
('4 of Diamonds',    'diamonds', '4',  4),
('6 of Diamonds',    'diamonds', '6',  6),

-- Clubs
('7 of Clubs',    'clubs',   '7',  7),
('Jack of Clubs', 'clubs',   'J',  11),
('3 of Clubs',    'clubs',   '3',  3),
('Queen of Clubs','clubs',   'Q',  12),
('9 of Clubs',    'clubs',   '9',  9),
('Ace of Clubs',  'clubs',   'A',  14),
('5 of Clubs',    'clubs',   '5',  5),
('King of Clubs', 'clubs',   'K',  13),
('2 of Clubs',    'clubs',   '2',  2),
('8 of Clubs',    'clubs',   '8',  8),
('10 of Clubs',   'clubs',   '10', 10),
('4 of Clubs',    'clubs',   '4',  4),
('6 of Clubs',    'clubs',   '6',  6),

-- Spades
('7 of Spades',    'spades',   '7',  7),
('Jack of Spades', 'spades',   'J',  11),
('3 of Spades',    'spades',   '3',  3),
('Queen of Spades','spades',   'Q',  12),
('9 of Spades',    'spades',   '9',  9),
('Ace of Spades',  'spades',   'A',  14),
('5 of Spades',    'spades',   '5',  5),
('King of Spades', 'spades',   'K',  13),
('2 of Spades',    'spades',   '2',  2),
('8 of Spades',    'spades',   '8',  8),
('10 of Spades',   'spades',   '10', 10),
('4 of Spades',    'spades',   '4',  4),
('6 of Spades',    'spades',   '6',  6);
