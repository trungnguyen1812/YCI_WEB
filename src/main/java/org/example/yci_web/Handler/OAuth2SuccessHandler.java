package org.example.yci_web.Handler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.example.yci_web.Entity.UserEntity;
import org.example.yci_web.Model.DTO.UserDTO;
import org.example.yci_web.Repository.UserRepository;
import org.modelmapper.ModelMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDateTime;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ModelMapper modelMapper;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        jakarta.servlet.http.HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");

        if (email == null || email.isBlank()) {
            response.sendRedirect("/login?error=google_no_email");
            return;
        }

        // Find or create user
        UserEntity user = userRepository.findByEmail(email);
        if (user == null) {
            // Auto-create new customer account
            user = new UserEntity();
            user.setEmail(email);
            user.setFullName(name != null ? name : "Google User");
            user.setPassword("$2a$10$google_oauth2_no_password_needed_"); // dummy, not usable
            user.setRole(1); // customer
            user.setCreatedAt(LocalDateTime.now());
            user.setUpdatedAt(LocalDateTime.now());
            userRepository.save(user);
        }

        // Set session
        HttpSession session = request.getSession(true);
        UserDTO userDTO = new UserDTO();
        modelMapper.map(user, userDTO);
        session.setAttribute("currentUser", userDTO);

        // Nếu thiếu số điện thoại → yêu cầu hoàn tất hồ sơ trước
        if (user.getPhone() == null || user.getPhone().isBlank()) {
            response.sendRedirect("/complete-profile");
            return;
        }

        // Redirect based on role
        Integer role = user.getRole();
        if (role != null && role == 0) {
            response.sendRedirect("/admin");
        } else if (role != null && role == 2) {
            response.sendRedirect("/staff");
        } else {
            response.sendRedirect("/profile");
        }
    }
}
