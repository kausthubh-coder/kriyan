#!/usr/bin/env perl
use strict;
use warnings;

my ($archive, $expected_epoch) = @ARGV;
die "usage: verify-canonical-archive.pl ARCHIVE [SOURCE_DATE_EPOCH]\n" unless defined $archive;

open my $compressed, '<:raw', $archive or die "cannot open release archive\n";
read($compressed, my $gzip_header, 10) == 10 or die "truncated gzip header\n";
close $compressed;
my @gzip = unpack('C10', $gzip_header);
die "release archive is not gzip\n" unless $gzip[0] == 0x1f && $gzip[1] == 0x8b && $gzip[2] == 8;
die "gzip header is not normalized with gzip -n\n" unless $gzip[3] == 0 && unpack('V', substr($gzip_header, 4, 4)) == 0;

open my $tar, '-|', 'gzip', '-dc', '--', $archive or die "cannot decompress release archive\n";
binmode $tar;

sub field {
  my ($block, $offset, $length) = @_;
  my $value = substr($block, $offset, $length);
  $value =~ s/\0.*//s;
  $value =~ s/\s+$//;
  return $value;
}

sub octal {
  my ($block, $offset, $length, $label) = @_;
  my $value = substr($block, $offset, $length);
  die "base-256 or malformed $label metadata is forbidden\n" if (ord(substr($value, 0, 1)) & 0x80);
  $value =~ s/[\0 ]+$//;
  $value =~ s/^\s+//;
  die "malformed $label metadata\n" unless $value =~ /^[0-7]+$/;
  return oct($value);
}

my @paths;
my %seen;
my $archive_epoch;
my $zero_blocks = 0;
while (1) {
  my $read = read($tar, my $header, 512);
  die "truncated tar header\n" unless defined $read && ($read == 0 || $read == 512);
  last if $read == 0;
  if ($header eq "\0" x 512) {
    $zero_blocks++;
    next;
  }
  die "non-zero data after tar terminator\n" if $zero_blocks;

  my $stored_checksum = octal($header, 148, 8, 'checksum');
  my $checksum_header = $header;
  substr($checksum_header, 148, 8, ' ' x 8);
  my $actual_checksum = 0;
  $actual_checksum += $_ for unpack('C*', $checksum_header);
  die "tar header checksum mismatch\n" unless $stored_checksum == $actual_checksum;

  my $magic = substr($header, 257, 6);
  my $version = substr($header, 263, 2);
  die "release archive must use PAX-free ustar metadata\n" unless $magic eq "ustar\0" && $version eq '00';

  my $name = field($header, 0, 100);
  my $prefix = field($header, 345, 155);
  my $path = length($prefix) ? "$prefix/$name" : $name;
  my $type = substr($header, 156, 1);
  $type = '0' if $type eq "\0";
  die "release archive contains a link, extension, or special entry\n" unless $type eq '0' || $type eq '5';
  die "release archive contains an unsafe path\n" if $path =~ m{^/} || $path =~ m{(?:^|/)\.\.(?:/|$)} || $path =~ /[\x00-\x1f\x7f]/;
  die "release archive contains a duplicate path\n" if $seen{$path}++;
  push @paths, $path;

  my $mode = octal($header, 100, 8, 'mode') & 07777;
  my $uid = octal($header, 108, 8, 'uid');
  my $gid = octal($header, 116, 8, 'gid');
  my $size = octal($header, 124, 12, 'size');
  my $mtime = octal($header, 136, 12, 'mtime');
  my $uname = field($header, 265, 32);
  my $gname = field($header, 297, 32);
  die "release owner/group metadata is not root 0/0\n" unless $uid == 0 && $gid == 0 && $uname eq 'root' && $gname eq 'root';
  die "release directory mode is not normalized\n" if $type eq '5' && $mode != 0755;
  die "release file mode is not normalized\n" if $type eq '0' && $mode != 0644 && $mode != 0755;
  die "packaged ELF mode is not executable\n" if $path =~ m{^(?:\./)?bin/(?:kriyan|kriyan-node)$} && $mode != 0755;
  die "directory entry has a payload\n" if $type eq '5' && $size != 0;
  $archive_epoch = $mtime unless defined $archive_epoch;
  die "release entry mtimes are not identical\n" unless $mtime == $archive_epoch;
  die "release entry mtime does not match SOURCE_DATE_EPOCH\n" if defined $expected_epoch && $mtime != $expected_epoch;

  my $payload = int(($size + 511) / 512) * 512;
  while ($payload > 0) {
    my $chunk = $payload > 65536 ? 65536 : $payload;
    read($tar, my $discard, $chunk) == $chunk or die "truncated tar payload\n";
    $payload -= $chunk;
  }
}
close $tar or die "gzip decompression failed\n";
die "tar archive is missing its two zero terminator blocks\n" unless $zero_blocks >= 2;
die "release archive is empty\n" unless @paths;
my @sorted = sort @paths;
for my $index (0 .. $#paths) {
  die "release entries are not in stable sorted order at $paths[$index] (expected $sorted[$index])\n"
    unless $paths[$index] eq $sorted[$index];
}
print "source_date_epoch=$archive_epoch\n";
